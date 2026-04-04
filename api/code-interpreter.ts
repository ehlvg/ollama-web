import { Sandbox } from "@vercel/sandbox";

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};

type Payload = {
  action?: string;
  session_name?: string;
  command?: string;
  cwd?: string;
  timeout_ms?: number;
  chat_id?: string;
};

function sandboxNameFrom(payload: Payload): string {
  const explicit = payload.session_name?.trim();
  if (explicit) return explicit.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
  const chatId = payload.chat_id?.trim() || crypto.randomUUID();
  return `ollama-web-${chatId}`.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
}

async function ensureToolchain(sandbox: Sandbox) {
  const readyCheck = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", "test -f /vercel/sandbox/.ollama-web-ready"],
  });

  if (readyCheck.exitCode === 0) return;

  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      [
        "set -e",
        "sudo dnf install -y curl python3.13 python3.13-pip zip >/dev/null",
        "if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; fi",
        "touch /vercel/sandbox/.ollama-web-ready",
      ].join(" && "),
    ],
  });
}

async function getSandbox(name: string) {
  try {
    return await Sandbox.get({ name, resume: true });
  } catch {
    return Sandbox.create({
      name,
      runtime: "node24",
      persistent: true,
      timeout: 15 * 60 * 1000,
      env: {
        BUN_INSTALL: "/vercel/sandbox/.bun",
      },
    });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = (req.body || {}) as Payload;
  const action = payload.action || "";
  const name = sandboxNameFrom(payload);

  try {
    if (action === "stop_session") {
      const sandbox = await Sandbox.get({ name, resume: true });
      await sandbox.stop();
      res.status(200).json({ ok: true, session_name: name, stopped: true });
      return;
    }

    const sandbox = await getSandbox(name);
    await ensureToolchain(sandbox);

    if (action === "create_session") {
      res.status(200).json({
        ok: true,
        session_name: name,
        cwd: "/vercel/sandbox",
        runtime: sandbox.runtime,
        note: "Session ready. Reuse session_name for future codeInterpreter calls.",
      });
      return;
    }

    if (action !== "run_command") {
      res.status(400).json({ error: "Unsupported action" });
      return;
    }

    const command = payload.command?.trim();
    if (!command) {
      res.status(400).json({ error: "command is required for run_command" });
      return;
    }

    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", command],
      cwd: payload.cwd || "/vercel/sandbox",
      env: {
        PATH: `/vercel/sandbox/.bun/bin:${process.env.PATH || ""}`,
      },
    });

    res.status(200).json({
      ok: true,
      session_name: name,
      cwd: payload.cwd || "/vercel/sandbox",
      exit_code: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Code interpreter failed";
    res.status(500).json({ error: message, session_name: name });
  }
}
