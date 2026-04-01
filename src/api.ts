import {
  ChatResponse,
  ChatsResponse,
  ChatEvent,
  DownloadEvent,
  ErrorEvent,
  Model,
  Settings,
  User,
} from "@/gotypes";
import { getOllamaHost, getApiKey, getOllamaDotComUrl, getCorsProxyUrl } from "./lib/web-config";

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

// Returns how many chars at the end of `text` match the beginning of `tag`
function partialTagMatchLength(text: string, tag: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len >= 1; len--) {
    if (text.endsWith(tag.slice(0, len))) {
      return len;
    }
  }
  return 0;
}

function getStoredChats(): Map<string, any> {
  const stored = localStorage.getItem(CHATS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    } catch {
      return new Map();
    }
  }
  return new Map();
}

function saveChats(chats: Map<string, any>): void {
  const obj = Object.fromEntries(chats);
  localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(obj));
}

function getStoredSettings(): Settings {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (stored) {
    try {
      return new Settings(JSON.parse(stored));
    } catch {
      return getDefaultSettings();
    }
  }
  return getDefaultSettings();
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

function saveSettingsFn(settings: Settings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return fetch(url, { ...options, headers });
}

export type CloudStatusSource = "env" | "config" | "both" | "none";
export interface CloudStatusResponse {
  disabled: boolean;
  source: CloudStatusSource;
}

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

export async function getModels(query?: string): Promise<Model[]> {
  const host = getOllamaHost();
  const response = await fetchWithAuth(`${host}/api/tags`);
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  const data = await response.json();

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
      const modelName = m.name.replace(/:latest$/, "");
      return new Model({
        model: modelName,
        digest: m.digest,
        modified_at: m.modified_at ? new Date(m.modified_at) : undefined,
      });
    });

  if (query) {
    const normalizedQuery = query.toLowerCase().trim();
    models = models.filter((m: Model) =>
      m.model.toLowerCase().includes(normalizedQuery),
    );
  }

  return models;
}

export async function getModelCapabilities(
  modelName: string,
): Promise<{ capabilities: string[] }> {
  const host = getOllamaHost();
  try {
    const response = await fetchWithAuth(`${host}/api/show`, {
      method: "POST",
      body: JSON.stringify({ model: modelName }),
    });
    if (!response.ok) {
      return { capabilities: [] };
    }
    const data = await response.json();
    return {
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
    };
  } catch {
    return { capabilities: [] };
  }
}

export type ChatEventUnion = ChatEvent | DownloadEvent | ErrorEvent;

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
    };
  }

  if (!_forceUpdate) {
    const userMsg = {
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
  }

  chat.updated_at = new Date().toISOString();
  if (!chat.title && message) {
    chat.title = message.slice(0, 50);
  }

  chats.set(actualChatId, chat);
  saveChats(chats);

  const assistantMsg = {
    role: "assistant",
    content: "",
    model: model.model,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!_forceUpdate) {
    chat.messages.push(assistantMsg);
    chats.set(actualChatId, chat);
    saveChats(chats);
  }

  // For web version, always use local Ollama host
  // Cloud models with API key will be proxied through local Ollama if configured
  // Direct calls to ollama.com from browser are blocked by CORS
  const host = getOllamaHost();
  const messages: any[] = [];

  for (const msg of chat.messages) {
    if (msg.role === "assistant" && msg.content === "" && !_forceUpdate) {
      continue;
    }
    const apiMsg: any = {
      role: msg.role,
      content: msg.content || "",
    };
    if (msg.attachments && msg.attachments.length > 0) {
      const imageData: string[] = [];
      let textContent = "";

      for (const att of msg.attachments as any[]) {
        const data: string = att.data;
        if (!data) continue;

        if (isImageFilename(att.filename)) {
          imageData.push(data);
        } else {
          // Decode text files (txt, md, js, ts, etc.) as UTF-8
          const text = base64ToText(data);
          if (text) {
            textContent += `[File: ${att.filename}]\n${text}\n\n`;
          }
        }
      }

      if (imageData.length > 0) {
        apiMsg.images = imageData;
      }
      if (textContent) {
        apiMsg.content = textContent + (apiMsg.content ? "\n" + apiMsg.content : "");
      }
    }
    messages.push(apiMsg);
  }

  const webSearchTools = _webSearch && getApiKey()
    ? [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current information",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query" },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "web_fetch",
            description: "Fetch the full content of a web page",
            parameters: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL to fetch" },
              },
              required: ["url"],
            },
          },
        },
      ]
    : undefined;

  try {
    // Tool-use loop: keep calling until the model stops requesting tools
    while (true) {
      const response = await fetchWithAuth(`${host}/api/chat`, {
        method: "POST",
        body: JSON.stringify({
          model: model.model,
          messages,
          stream: true,
          ...(webSearchTools ? { tools: webSearchTools } : {}),
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let lineBuffer = "";
      let fullContent = "";
      let fullThinking = "";
      let toolCalls: Array<{ function: { name: string; arguments: Record<string, string> } }> = [];
      let doneReason = "";

      // Think-tag parsing state (for inline <think> tags in message.content)
      let isInThink = false;
      let thinkingStart: Date | undefined;
      let thinkingEnd: Date | undefined;
      let tagBuffer = "";
      // Tracks whether we're in Ollama native thinking mode (message.thinking field)
      let isNativeThinking = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const data = JSON.parse(line);
          if (data.message?.tool_calls) {
            toolCalls = data.message.tool_calls;
          }
          if (data.done_reason) {
            doneReason = data.done_reason;
          }
          return data;
        } catch {
          return null;
        }
      };

      // Sync generator: parses <think>...</think> tags from content chunks
      const processContent = function*(raw: string): Generator<ChatEvent> {
        tagBuffer += raw;

        while (tagBuffer.length > 0) {
          if (isInThink) {
            const closeTag = "</think>";
            const idx = tagBuffer.indexOf(closeTag);
            if (idx === -1) {
              const partialLen = partialTagMatchLength(tagBuffer, closeTag);
              const safe = tagBuffer.slice(0, tagBuffer.length - partialLen);
              if (safe) {
                fullThinking += safe;
                yield new ChatEvent({ eventName: "thinking", thinking: safe, thinkingTimeStart: thinkingStart });
              }
              tagBuffer = partialLen > 0 ? tagBuffer.slice(tagBuffer.length - partialLen) : "";
              break;
            } else {
              const before = tagBuffer.slice(0, idx);
              if (before) {
                fullThinking += before;
                yield new ChatEvent({ eventName: "thinking", thinking: before, thinkingTimeStart: thinkingStart });
              }
              thinkingEnd = new Date();
              yield new ChatEvent({ eventName: "thinking", thinking: "", thinkingTimeStart: thinkingStart, thinkingTimeEnd: thinkingEnd });
              isInThink = false;
              tagBuffer = tagBuffer.slice(idx + closeTag.length);
            }
          } else {
            const openTag = "<think>";
            const idx = tagBuffer.indexOf(openTag);
            if (idx === -1) {
              const partialLen = partialTagMatchLength(tagBuffer, openTag);
              const safe = tagBuffer.slice(0, tagBuffer.length - partialLen);
              if (safe) {
                fullContent += safe;
                yield new ChatEvent({ eventName: "chat", content: safe });
              }
              tagBuffer = partialLen > 0 ? tagBuffer.slice(tagBuffer.length - partialLen) : "";
              break;
            } else {
              const before = tagBuffer.slice(0, idx);
              if (before) {
                fullContent += before;
                yield new ChatEvent({ eventName: "chat", content: before });
              }
              isInThink = true;
              thinkingStart = new Date();
              yield new ChatEvent({ eventName: "thinking", thinking: "", thinkingTimeStart: thinkingStart });
              tagBuffer = tagBuffer.slice(idx + openTag.length);
            }
          }
        }
      };

      const processChunk = function*(data: any): Generator<ChatEvent> {
        // Handle Ollama native thinking field (message.thinking)
        if (data.message?.thinking) {
          if (!isNativeThinking) {
            isNativeThinking = true;
            thinkingStart = new Date();
            yield new ChatEvent({ eventName: "thinking", thinking: "", thinkingTimeStart: thinkingStart });
          }
          fullThinking += data.message.thinking;
          yield new ChatEvent({ eventName: "thinking", thinking: data.message.thinking, thinkingTimeStart: thinkingStart });
        }

        // Handle content (may contain inline <think> tags)
        if (data.message?.content) {
          // End native thinking when regular content arrives
          if (isNativeThinking) {
            isNativeThinking = false;
            thinkingEnd = new Date();
            yield new ChatEvent({ eventName: "thinking", thinking: "", thinkingTimeStart: thinkingStart, thinkingTimeEnd: thinkingEnd });
          }
          yield* processContent(data.message.content);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const data = processLine(line);
          if (data) yield* processChunk(data);
        }
      }

      // Process any remaining buffered data
      if (lineBuffer.trim()) {
        const data = processLine(lineBuffer);
        if (data) yield* processChunk(data);
      }

      // Flush any partial tag that was buffered from processContent
      if (tagBuffer) {
        if (isInThink) {
          fullThinking += tagBuffer;
          yield new ChatEvent({ eventName: "thinking", thinking: tagBuffer, thinkingTimeStart: thinkingStart, thinkingTimeEnd: new Date() });
        } else {
          fullContent += tagBuffer;
          yield new ChatEvent({ eventName: "chat", content: tagBuffer });
        }
        tagBuffer = "";
      }

      // Close out any open native thinking
      if (isNativeThinking) {
        thinkingEnd = new Date();
        yield new ChatEvent({ eventName: "thinking", thinking: "", thinkingTimeStart: thinkingStart, thinkingTimeEnd: thinkingEnd });
      }

      if (doneReason === "tool_calls" && toolCalls.length > 0) {
        // Add the assistant's tool-call turn to messages
        messages.push({
          role: "assistant",
          content: fullContent,
          tool_calls: toolCalls,
        });

        // Execute each requested tool and append results
        for (const toolCall of toolCalls) {
          let toolResult: string;
          try {
            // arguments can be an object or a JSON-encoded string depending on model
            const args: Record<string, string> =
              typeof toolCall.function.arguments === "string"
                ? (() => { try { return JSON.parse(toolCall.function.arguments); } catch { return {}; } })()
                : (toolCall.function.arguments as Record<string, string>) || {};

            if (toolCall.function.name === "web_search") {
              const result = await webSearch(args.query);
              toolResult = result.results
                .map((r) => `**${r.title}**\n${r.url}\n${r.content}`)
                .join("\n\n");
            } else if (toolCall.function.name === "web_fetch") {
              const result = await webFetch(args.url);
              toolResult = `**${result.title}**\n${result.content}`;
            } else {
              toolResult = `Unknown tool: ${toolCall.function.name}`;
            }
          } catch (e) {
            toolResult = `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`;
          }

          messages.push({ role: "tool", content: toolResult });
        }
        // Continue loop to send tool results back to the model
      } else {
        // No more tool calls — save and finish
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.content = fullContent;
          lastMsg.thinking = fullThinking;
          if (thinkingStart) lastMsg.thinkingTimeStart = thinkingStart;
          if (thinkingEnd) lastMsg.thinkingTimeEnd = thinkingEnd;
          lastMsg.updated_at = new Date().toISOString();
        }

        chats.set(actualChatId, chat);
        saveChats(chats);

        yield new ChatEvent({ eventName: "done" });
        break;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    yield new ErrorEvent({ eventName: "error", error: errorMsg });
  }
}

export async function getSettings(): Promise<{ settings: Settings }> {
  const settings = getStoredSettings();
  return { settings };
}

export async function updateSettings(
  newSettings: Settings,
): Promise<{ settings: Settings }> {
  saveSettingsFn(newSettings);
  return { settings: newSettings };
}

export async function updateCloudSetting(
  enabled: boolean,
): Promise<CloudStatusResponse> {
  const settings = getStoredSettings();
  settings.TurboEnabled = enabled;
  saveSettingsFn(settings);
  return { disabled: !enabled, source: "config" };
}

export async function renameChat(
  chatId: string,
  title: string,
): Promise<void> {
  const chats = getStoredChats();
  const chat = chats.get(chatId);
  if (chat) {
    chat.title = title;
    chat.updated_at = new Date().toISOString();
    chats.set(chatId, chat);
    saveChats(chats);
  }
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
  const host = getOllamaHost();
  const response = await fetchWithAuth(`${host}/api/pull`, {
    method: "POST",
    body: JSON.stringify({ name: modelName }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        yield {
          status: data.status || "",
          digest: data.digest,
          total: data.total,
          completed: data.completed,
          done: data.status === "success",
        };
      } catch {}
    }
  }
}

export async function getInferenceCompute(): Promise<{
  inferenceComputes: any[];
  defaultContextLength: number;
}> {
  return {
    inferenceComputes: [],
    defaultContextLength: 4096,
  };
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const host = getOllamaHost();
    const response = await fetchWithAuth(`${host}/api/version`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function getCloudStatus(): Promise<CloudStatusResponse | null> {
  // For web version, cloud is enabled if API key is set
  const apiKey = getApiKey();
  return {
    disabled: !apiKey,
    source: "config",
  };
}

export async function webSearch(query: string, maxResults: number = 5): Promise<{
  results: Array<{ title: string; url: string; content: string }>;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API key required for web search. Set it in Settings.");
  }

  const corsProxy = getCorsProxyUrl();
  const baseUrl = getOllamaDotComUrl();
  
  let fetchUrl: string;
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
  
  if (corsProxy) {
    // local-cors-proxy: http://localhost:8080 proxies to target directly
    // so requests go to http://localhost:8080/web_search (not full URL)
    // Other proxies like cors-anywhere append full URL
    if (corsProxy.includes("localhost") || corsProxy.includes("127.0.0.1")) {
      // Local proxy - just use the endpoint path
      fetchUrl = `${corsProxy.replace(/\/$/, '')}/web_search`;
    } else if (corsProxy.includes("allorigins") || corsProxy.includes("?url=")) {
      // URL-encoded format for proxies that need full URL encoded
      const targetUrl = `${baseUrl}/api/web_search`;
      fetchUrl = `${corsProxy}${encodeURIComponent(targetUrl)}`;
      if (corsProxy.includes("allorigins")) {
        headers = { "Content-Type": "application/json" };
      }
    } else {
      // cors-anywhere style - full URL appended
      fetchUrl = `${corsProxy.replace(/\/$/, '')}/${baseUrl}/api/web_search`;
    }
  } else {
    fetchUrl = `${baseUrl}/api/web_search`;
  }
  
  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        max_results: maxResults,
      }),
    });
  } catch (fetchError) {
    throw new Error(`Web search failed: ${fetchError instanceof Error ? fetchError.message : 'Network error'}. Check if proxy is running.`);
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("CORS proxy access forbidden. Visit the proxy URL in your browser to enable temporary access, or use a different proxy.");
    }
    if (response.status === 404) {
      throw new Error("Web search endpoint not found (404). Make sure local-cors-proxy is running with: npx local-cors-proxy --proxyUrl https://ollama.com/api/ --port 8080");
    }
    if (response.status === 0 || response.type === "opaque") {
      throw new Error("Web search failed: CORS blocked. Configure a CORS proxy in Settings.");
    }
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Web search failed (${response.status}): ${errorText.slice(0, 100)}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    throw new Error(`Invalid response from web search. ${text.slice(0, 100) || 'Not JSON.'}`);
  }

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error(`Unexpected response format from web search.`);
  }

  return data;
}

export async function webFetch(url: string): Promise<{
  title: string;
  content: string;
  links: string[];
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API key required for web fetch");
  }

  const corsProxy = getCorsProxyUrl();
  const baseUrl = getOllamaDotComUrl();
  
  let fetchUrl: string;
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
  
  if (corsProxy) {
    if (corsProxy.includes("localhost") || corsProxy.includes("127.0.0.1")) {
      // Local proxy - just use the endpoint path
      fetchUrl = `${corsProxy.replace(/\/$/, '')}/web_fetch`;
    } else if (corsProxy.includes("allorigins") || corsProxy.includes("?url=")) {
      const targetUrl = `${baseUrl}/api/web_fetch`;
      fetchUrl = `${corsProxy}${encodeURIComponent(targetUrl)}`;
      if (corsProxy.includes("allorigins")) {
        headers = { "Content-Type": "application/json" };
      }
    } else {
      fetchUrl = `${corsProxy.replace(/\/$/, '')}/${baseUrl}/api/web_fetch`;
    }
  } else {
    fetchUrl = `${baseUrl}/api/web_fetch`;
  }

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("CORS proxy forbidden. Visit the proxy site to enable temporary access, or use a different proxy.");
    }
    if (response.status === 0 || response.type === "opaque") {
      throw new Error("Web fetch failed: CORS error. Configure a CORS proxy in Settings.");
    }
    throw new Error(`Web fetch failed: ${response.statusText}`);
  }

  return response.json();
}