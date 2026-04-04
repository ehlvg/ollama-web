const DEFAULT_OLLAMA_HOST = "https://ollama.com";

type RuntimeConfig = {
  ollamaHost?: string;
};

function storageGet(key: string): string | null {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function"
  ) {
    return null;
  }
  return localStorage.getItem(key);
}

function storageSet(key: string, value: string): void {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.setItem !== "function"
  ) {
    return;
  }
  localStorage.setItem(key, value);
}

function storageRemove(key: string): void {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.removeItem !== "function"
  ) {
    return;
  }
  localStorage.removeItem(key);
}

declare global {
  interface Window {
    __OLLAMA_WEB_CONFIG__?: RuntimeConfig;
  }
}

function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") return {};
  const cfg = window.__OLLAMA_WEB_CONFIG__;
  if (!cfg || typeof cfg !== "object") return {};
  return cfg;
}

function normalizeOllamaHost(rawHost: string): string {
  const trimmed = rawHost.trim();
  if (!trimmed) return trimmed;

  // Allow config like "/ollama" and normalize to absolute same-origin URL.
  // The ollama-js client expects an absolute base URL.
  if (trimmed.startsWith("/") && typeof window !== "undefined") {
    try {
      return new URL(trimmed.replace(/\/+$/, ""), window.location.origin).toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function getOllamaHost(): string {
  const stored = storageGet("ollama_host");
  if (stored) {
    return normalizeOllamaHost(stored);
  }

  const runtime = getRuntimeConfig().ollamaHost;
  if (runtime && typeof runtime === "string") return normalizeOllamaHost(runtime);

  return normalizeOllamaHost(DEFAULT_OLLAMA_HOST);
}

export function setOllamaHost(host: string): void {
  storageSet("ollama_host", host);
}

export function getApiKey(): string | null {
  return storageGet("ollama_api_key");
}

export function setApiKey(key: string | null): void {
  if (key) {
    storageSet("ollama_api_key", key);
  } else {
    storageRemove("ollama_api_key");
  }
}
