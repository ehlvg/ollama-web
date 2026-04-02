import {
  ChatResponse,
  ChatsResponse,
  ChatEvent,
  DownloadEvent,
  ErrorEvent,
  Message,
  Model,
  ModelCapabilitiesResponse,
  Settings,
  User,
  ToolCall,
  ToolFunction,
} from "@/gotypes";
import { Ollama } from "ollama/browser";
import type { Message as OllamaMessage, Tool as OllamaTool, ToolCall as OllamaToolCall } from "ollama";
import { getOllamaHost, getApiKey, getCorsProxyUrl, getOllamaDotComUrl } from "./lib/web-config";

const CHATS_STORAGE_KEY = "ollama_web_chats";
const SETTINGS_STORAGE_KEY = "ollama_web_settings";

declare module "@/gotypes" {
  interface Model {
    isCloud(): boolean;
  }
}

Model.prototype.isCloud = function (): boolean {
  return this.model.endsWith("cloud");
};

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function isImageFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() || "";
  return ["png", "jpg", "jpeg", "webp"].includes(ext);
}

function base64ToText(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function getStoredChats(): Map<string, any> {
  const stored = localStorage.getItem(CHATS_STORAGE_KEY);
  if (!stored) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(stored)));
  } catch {
    return new Map();
  }
}

function saveChats(chats: Map<string, any>): void {
  localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(Object.fromEntries(chats)));
}

function getDefaultSettings(): Settings {
  return new Settings({
    Expose: false,
    Browser: false,
    Survey: false,
    Models: "",
    Agent: false,
    Tools: false,
    WorkingDir: "",
    ContextLength: 4096,
    TurboEnabled: false,
    WebSearchEnabled: false,
    ThinkEnabled: false,
    ThinkLevel: "medium",
    SelectedModel: "",
    SidebarOpen: true,
    AutoUpdateEnabled: false,
  });
}

function getStoredSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!stored) return getDefaultSettings();
  try {
    return new Settings(JSON.parse(stored));
  } catch {
    return getDefaultSettings();
  }
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function getClients() {
  const apiKey = getApiKey();
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;

  // Same Ollama client can talk to both local server (/api/*) and ollama.com tools
  // (ollama-js hardcodes https://ollama.com for webSearch/webFetch, but still uses `headers`).
  const local = new Ollama({
    host: getOllamaHost(),
    headers,
  });

  return { ollama: local };
}

export type CloudStatusResponse = {
  disabled: boolean;
  source: "env" | "config" | "both" | "none";
};

export type ChatEventUnion = ChatEvent | DownloadEvent | ErrorEvent;

export async function fetchUser(): Promise<User | null> {
  return null;
}

export async function fetchConnectUrl(): Promise<string> {
  return "";
}

export async function disconnectUser(): Promise<void> {}

export async function getChats(): Promise<ChatsResponse> {
  const chats = getStoredChats();
  const chatInfos = Array.from(chats.values())
    .map((chat: any) => ({
      id: chat.id,
      title: chat.title || "",
      userExcerpt: chat.messages?.[0]?.content || "",
      createdAt: new Date(chat.created_at || Date.now()),
      updatedAt: new Date(chat.updated_at || Date.now()),
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return new ChatsResponse({ chatInfos });
}

export async function getChat(chatId: string): Promise<ChatResponse> {
  const chats = getStoredChats();
  const chat = chats.get(chatId);

  if (!chat) {
    return new ChatResponse({ chat: { id: chatId, messages: [], title: "" } });
  }

  return new ChatResponse({ chat });
}

function toToolCallsForOllama(toolCalls: ToolCall[] | undefined) {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(tc.function.arguments);
      if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
    } catch {}

    return {
      function: {
        name: tc.function.name,
        arguments: args,
      },
    };
  });
}

function toolCallToGotypes(toolCalls: OllamaToolCall[]): ToolCall[] {
  return toolCalls.map((tc) => {
    return {
      type: "function",
      function: new ToolFunction({
        name: tc.function.name,
        arguments: JSON.stringify(tc.function.arguments ?? {}),
      }),
    } as ToolCall;
  });
}

function extractAttachmentsForOllama(userMsg: Message): {
  images?: string[];
  textContent?: string;
} {
  const attachments: any[] | undefined = userMsg.attachments as any[] | undefined;
  if (!attachments || attachments.length === 0) return {};

  const images: string[] = [];
  let textContent = "";

  for (const att of attachments) {
    const filename = String(att?.filename ?? "");
    const data = att?.data;
    if (!data || !filename) continue;

    if (!isImageFilename(filename)) {
      if (typeof data === "string") {
        const text = base64ToText(data);
        if (text) {
          textContent += `[File: ${filename}]\n${text}\n\n`;
        }
      }
      continue;
    }

    if (typeof data === "string") {
      images.push(data);
    }
  }

  return {
    images: images.length > 0 ? images : undefined,
    textContent: textContent.length > 0 ? textContent : undefined,
  };
}

function chatMessageToOllamaMessage(msg: Message): OllamaMessage | null {
  // Skip empty assistant placeholder messages.
  if (
    msg.role === "assistant" &&
    (!msg.content || !msg.content.trim()) &&
    (!msg.thinking || !msg.thinking.trim()) &&
    (!msg.tool_calls || msg.tool_calls.length === 0)
  ) {
    return null;
  }

  const base: any = {
    role: msg.role,
    content: msg.content || "",
  };

  if (msg.role === "tool") {
    base.tool_name = msg.tool_name || (msg as any).toolName;
  }

  if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
    base.tool_calls = toToolCallsForOllama(msg.tool_calls);
  }

  const attachmentsExtracted =
    msg.attachments && msg.attachments.length > 0
      ? extractAttachmentsForOllama(msg)
      : {};

  if (attachmentsExtracted.images && attachmentsExtracted.images.length > 0) {
    base.images = attachmentsExtracted.images;
  }

  if (attachmentsExtracted.textContent) {
    base.content = attachmentsExtracted.textContent + (base.content ? `\n${base.content}` : "");
  }

  if (msg.role === "assistant" && msg.thinking) {
    base.thinking = msg.thinking;
  }

  return base as OllamaMessage;
}

export async function getSettings(): Promise<{ settings: Settings }> {
  const settings = getStoredSettings();
  return { settings };
}

export async function updateSettings(newSettings: Settings): Promise<{ settings: Settings }> {
  saveSettings(newSettings);
  return { settings: newSettings };
}

export async function updateCloudSetting(enabled: boolean): Promise<CloudStatusResponse> {
  const settings = getStoredSettings();
  settings.TurboEnabled = enabled;
  saveSettings(settings);
  return { disabled: !enabled, source: "config" };
}

export async function getCloudStatus(): Promise<CloudStatusResponse | null> {
  const apiKey = getApiKey();
  return {
    disabled: !apiKey,
    source: "config",
  };
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const chats = getStoredChats();
  const chat = chats.get(chatId);
  if (!chat) return;
  chat.title = title;
  chat.updated_at = new Date().toISOString();
  chats.set(chatId, chat);
  saveChats(chats);
}

export async function deleteChat(chatId: string): Promise<void> {
  const chats = getStoredChats();
  chats.delete(chatId);
  saveChats(chats);
}

export async function getModelUpstreamInfo(
  _model: Model,
): Promise<{ stale: boolean; exists: boolean; error?: string }> {
  return { stale: false, exists: true };
}

export async function* pullModel(
  modelName: string,
  signal?: AbortSignal,
): AsyncGenerator<{
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  done?: boolean;
}> {
  const { ollama } = getClients();

  const iteratorOrProgress = await ollama.pull({ model: modelName, stream: true, insecure: false } as any);
  const itr = iteratorOrProgress as any;
  if (signal) {
    const abort = () => itr.abort();
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }

  for await (const part of itr as any) {
    const isDone = (part as any)?.status === "success";
    yield {
      status: part.status,
      digest: part.digest,
      total: part.total,
      completed: part.completed,
      done: isDone,
    };
    if (isDone) break;
  }
}

export async function getInferenceCompute(): Promise<{
  inferenceComputes: any[];
  defaultContextLength: number;
}> {
  return {
    inferenceComputes: [],
    defaultContextLength: getStoredSettings().ContextLength || 4096,
  };
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const { ollama } = getClients();
    const res = await ollama.version();
    return Boolean(res?.version);
  } catch {
    return false;
  }
}

export async function getModels(query?: string): Promise<Model[]> {
  const { ollama } = getClients();
  const data = await ollama.list();

  let models: Model[] = (data.models || [])
    .filter((m: any) => {
      const families = m.details?.families;
      if (!families || families.length === 0) return true;
      const isBertOnly = families.every((family: string) =>
        family.toLowerCase().includes("bert"),
      );
      return !isBertOnly;
    })
    .map((m: any) => {
      const modelName = String(m.name).replace(/:latest$/, "");
      return new Model({
        model: modelName,
        digest: m.digest,
        modified_at: m.modified_at ? new Date(m.modified_at) : undefined,
      });
    });

  if (query) {
    const normalizedQuery = query.toLowerCase().trim();
    models = models.filter((m: Model) => m.model.toLowerCase().includes(normalizedQuery));
  }

  return models;
}

export async function getModelCapabilities(
  modelName: string,
): Promise<ModelCapabilitiesResponse> {
  const { ollama } = getClients();
  try {
    const data = await ollama.show({ model: modelName });
    return new ModelCapabilitiesResponse({
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    });
  } catch {
    return new ModelCapabilitiesResponse({ capabilities: [] });
  }
}

function thinkingLevelParam(think: boolean | string | undefined) {
  if (think === undefined || think === null || think === false) return undefined;
  if (think === true) return true;
  if (typeof think === "string") {
    const normalized = think.toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  }
  return undefined;
}

function buildWebSearchTools(): OllamaTool[] {
  return [
    {
      type: "function",
      function: {
        name: "webSearch",
        description: "Performs a web search for the given query.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query string." },
            max_results: {
              type: "number",
              description: "The maximum number of results to return per query (default 3).",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "webFetch",
        description: "Fetches a single page by URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "A single URL to fetch." },
          },
          required: ["url"],
        },
      },
    },
  ] as any;
}

function deltaFrom(acc: string, next: string) {
  if (!acc) return next;
  if (next.startsWith(acc)) return next.slice(acc.length);
  return next;
}

function getOllamaDotComApiBase(): string {
  const proxy = getCorsProxyUrl();
  if (proxy) {
    const cleaned = proxy.replace(/\/+$/, "");
    return cleaned.endsWith("/proxy") ? cleaned : `${cleaned}/proxy`;
  }
  return `${getOllamaDotComUrl().replace(/\/+$/, "")}/api`;
}

async function callOllamaDotComTool<T>(path: "web_search" | "web_fetch", body: unknown): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${getOllamaDotComApiBase()}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tool ${path} failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function* sendMessage(
  chatId: string,
  message: string,
  model: Model,
  attachments?: Array<{ filename: string; data: Uint8Array }>,
  signal?: AbortSignal,
  _index?: number,
  _webSearch?: boolean,
  _fileTools?: boolean,
  _forceUpdate?: boolean,
  _think?: boolean | string,
): AsyncGenerator<ChatEventUnion> {
  const { ollama } = getClients();
  const { ContextLength } = getStoredSettings();

  let actualChatId = chatId;
  if (chatId === "new") {
    actualChatId = crypto.randomUUID();
    yield new ChatEvent({ eventName: "chat_created", chatId: actualChatId });
  }

  const chats = getStoredChats();
  let chat = chats.get(actualChatId);
  if (!chat) {
    chat = {
      id: actualChatId,
      messages: [],
      title: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const nowIso = () => new Date().toISOString();

  if (!_forceUpdate) {
    const userMsg = {
      role: "user",
      content: message,
      created_at: nowIso(),
      updated_at: nowIso(),
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        data: uint8ArrayToBase64(a.data),
      })),
    };

    if (_index !== undefined && _index >= 0) {
      chat.messages = chat.messages.slice(0, _index);
      chat.messages.push(userMsg);
    } else {
      chat.messages.push(userMsg);
    }

    if (!chat.title && message) {
      chat.title = message.slice(0, 50);
    }

    // Placeholder assistant message. We'll overwrite it after streaming finishes.
    const assistantMsg = {
      role: "assistant",
      content: "",
      thinking: "",
      model: model.model,
      created_at: nowIso(),
      updated_at: nowIso(),
      stream: false,
    };
    chat.messages.push(assistantMsg);
  } else {
    // Regenerate: reuse the last assistant message.
    if (!chat.messages || chat.messages.length === 0) {
      chat.messages = [
        {
          role: "assistant",
          content: "",
          thinking: "",
          model: model.model,
          created_at: nowIso(),
          updated_at: nowIso(),
          stream: false,
        },
      ];
    }
  }

  chat.updated_at = nowIso();
  chats.set(actualChatId, chat);
  saveChats(chats);

  // Identify the current assistant message index we will overwrite.
  let currentAssistantIndex = (() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i]?.role === "assistant") return i;
    }
    return chat.messages.length - 1;
  })();

  const toolCallsEnabled = Boolean(_webSearch) && Boolean(getApiKey());
  const tools = toolCallsEnabled ? buildWebSearchTools() : undefined;
  const think = thinkingLevelParam(_think);

  // Convert stored messages to Ollama request messages on each tool loop iteration.
  const buildRequestMessages = () => {
    const storedMessages: any[] = chat.messages || [];
    const converted: OllamaMessage[] = [];

    for (const m of storedMessages) {
      const gotypesMsg = m instanceof Message ? m : new Message(m);
      const ollamaMsg = chatMessageToOllamaMessage(gotypesMsg);
      if (ollamaMsg) converted.push(ollamaMsg);
    }

    return converted;
  };

  try {
    while (true) {
      let accumulatedContent = "";
      let accumulatedThinking = "";
      let toolCalls: OllamaToolCall[] = [];

      let thinkingStart: Date | undefined;
      let thinkingEnd: Date | undefined;
      let sawThinking = false;
      let sawContent = false;

      const responseStream = (await ollama.chat({
        model: model.model,
        messages: buildRequestMessages(),
        stream: true,
        tools,
        think,
        options: {
          num_ctx: ContextLength,
        } as any,
      } as any)) as any;

      if (signal) {
        const abort = () => responseStream.abort();
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }

      for await (const part of responseStream as any) {
        const msg = part.message as any;
        if (msg?.thinking !== undefined && typeof msg.thinking === "string") {
          const delta = deltaFrom(accumulatedThinking, msg.thinking);
          if (delta) {
            if (!sawThinking) {
              sawThinking = true;
              thinkingStart = new Date();
              yield new ChatEvent({
                eventName: "thinking",
                thinking: delta,
                thinkingTimeStart: thinkingStart,
              });
            } else {
              yield new ChatEvent({
                eventName: "thinking",
                thinking: delta,
              });
            }
            accumulatedThinking += delta;
          }
        }

        if (msg?.content !== undefined && typeof msg.content === "string" && msg.content) {
          const delta = deltaFrom(accumulatedContent, msg.content);
          if (delta) {
            if (!sawContent) sawContent = true;
            if (sawThinking && thinkingEnd === undefined && (!msg.thinking || msg.thinking.length === 0)) {
              thinkingEnd = new Date();
              yield new ChatEvent({
                eventName: "thinking",
                thinking: "",
                thinkingTimeStart: thinkingStart,
                thinkingTimeEnd: thinkingEnd,
              });
            }

            yield new ChatEvent({
              eventName: "chat",
              content: delta,
            });
            accumulatedContent += delta;
          }
        }

        if (msg?.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          toolCalls = msg.tool_calls as OllamaToolCall[];
        }

        if (part.done) {
        }
      }

      // close thinking if server provided only thinking (no subsequent content)
      if (sawThinking && thinkingEnd === undefined) {
        thinkingEnd = new Date();
        yield new ChatEvent({
          eventName: "thinking",
          thinking: "",
          thinkingTimeStart: thinkingStart,
          thinkingTimeEnd: thinkingEnd,
        });
      }

      if (toolCalls.length > 0) {
        const mappedToolCalls = toolCallsToGotypes(toolCalls);

        // Overwrite current assistant message in localStorage with tool calls.
        const assistant = chat.messages[currentAssistantIndex];
        if (assistant) {
          assistant.content = accumulatedContent;
          assistant.thinking = accumulatedThinking;
          assistant.tool_calls = mappedToolCalls;
          if (thinkingStart) assistant.thinkingTimeStart = thinkingStart;
          if (thinkingEnd) assistant.thinkingTimeEnd = thinkingEnd;
          assistant.updated_at = nowIso();
        }

        // Update query state: tool call UI.
        yield new ChatEvent({
          eventName: "assistant_with_tools",
          toolCalls: mappedToolCalls,
          thinkingTimeStart: thinkingStart,
          thinkingTimeEnd: thinkingEnd,
        });

        // Execute tools and push tool results back into the conversation.
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const args = toolCall.function.arguments as any;

          if (toolName === "webSearch" || toolName === "web_search") {
            const query = typeof args?.query === "string" ? args.query : "";
            const max_results =
              typeof args?.max_results === "number"
                ? args.max_results
                : typeof args?.maxResults === "number"
                  ? args.maxResults
                  : 5;

            let toolResultText = "";
            try {
              const web = await callOllamaDotComTool<any>("web_search", { query, max_results });
              toolResultText = JSON.stringify(web).slice(0, 8000);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const hint = msg.includes("Failed to fetch")
                ? " (CORS: set a CORS proxy in Settings → CORS Proxy (for web search))"
                : "";
              toolResultText = `ERROR: ${msg}${hint}`;
            }

            chat.messages.push({
              role: "tool",
              content: toolResultText,
              tool_name: toolName,
              created_at: nowIso(),
              updated_at: nowIso(),
            });

            yield new ChatEvent({
              eventName: "tool_result",
              content: toolResultText,
              toolName,
            });
          } else if (toolName === "webFetch" || toolName === "web_fetch") {
            const url = typeof args?.url === "string" ? args.url : "";
            let toolResultText = "";
            try {
              const web = await callOllamaDotComTool<any>("web_fetch", { url });
              toolResultText = JSON.stringify(web).slice(0, 8000);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const hint = msg.includes("Failed to fetch")
                ? " (CORS: set a CORS proxy in Settings → CORS Proxy (for web search))"
                : "";
              toolResultText = `ERROR: ${msg}${hint}`;
            }

            chat.messages.push({
              role: "tool",
              content: toolResultText,
              tool_name: toolName,
              created_at: nowIso(),
              updated_at: nowIso(),
            });

            yield new ChatEvent({
              eventName: "tool_result",
              content: toolResultText,
              toolName,
            });
          } else {
            const toolResultText = `Unknown tool: ${toolName}`;

            chat.messages.push({
              role: "tool",
              content: toolResultText,
              tool_name: toolName,
              created_at: nowIso(),
              updated_at: nowIso(),
            });

            yield new ChatEvent({
              eventName: "tool_result",
              content: toolResultText,
              toolName,
            });
          }
        }

        // Append a new assistant placeholder for the model's next response.
        chat.messages.push({
          role: "assistant",
          content: "",
          thinking: "",
          model: model.model,
          created_at: nowIso(),
          updated_at: nowIso(),
          stream: false,
        });
        currentAssistantIndex = chat.messages.length - 1;

        chats.set(actualChatId, chat);
        saveChats(chats);
        continue;
      }

      // Stop: overwrite current assistant message with final content.
      const assistant = chat.messages[currentAssistantIndex];
      if (assistant) {
        assistant.content = accumulatedContent;
        assistant.thinking = accumulatedThinking;
        if (thinkingStart) assistant.thinkingTimeStart = thinkingStart;
        if (thinkingEnd) assistant.thinkingTimeEnd = thinkingEnd;
        assistant.updated_at = nowIso();
      }

      chats.set(actualChatId, chat);
      saveChats(chats);

      yield new ChatEvent({ eventName: "done" });
      break;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    yield new ErrorEvent({ eventName: "error", error: errorMsg });
  }
}

function toolCallsToGotypes(toolCalls: OllamaToolCall[]): ToolCall[] {
  return toolCallToGotypes(toolCalls);
}

