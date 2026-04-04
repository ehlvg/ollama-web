import { Readable } from "node:stream";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-ollama-authorization",
]);

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split(".").map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }

  return false;
}

async function readBody(req: any): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  const rawUrl = typeof req.query?.url === "string" ? req.query.url : "";
  if (!rawUrl) {
    res.status(400).json({ error: "Missing url query parameter" });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid target URL" });
    return;
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    res.status(400).json({ error: "Unsupported target protocol" });
    return;
  }

  if (isPrivateHostname(targetUrl.hostname)) {
    res.status(403).json({ error: "Private Ollama hosts are not allowed through the proxy" });
    return;
  }

  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (typeof value !== "string") continue;
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    requestHeaders.set(key, value);
  }

  const forwardedAuthorization =
    typeof req.headers?.["x-ollama-authorization"] === "string"
      ? req.headers["x-ollama-authorization"]
      : typeof req.headers?.authorization === "string"
        ? req.headers.authorization
        : null;

  const authSource =
    typeof req.headers?.["x-ollama-authorization"] === "string"
      ? "x-ollama-authorization"
      : typeof req.headers?.authorization === "string"
        ? "authorization"
        : "none";

  if (forwardedAuthorization) {
    requestHeaders.set("authorization", forwardedAuthorization);
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: requestHeaders,
      body: await readBody(req),
      redirect: "manual",
    });

    res.status(upstream.status);
    res.setHeader("x-ollama-proxy-auth-source", authSource);
    res.setHeader("x-ollama-proxy-has-auth", forwardedAuthorization ? "true" : "false");
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    res.status(502).json({ error: message });
  }
}
