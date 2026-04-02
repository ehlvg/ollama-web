const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";

type RuntimeConfig = {
  ollamaHost?: string;
  corsProxyUrl?: string | null;
  ollamaDotComUrl?: string;
};

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

export function getOllamaHost(): string {
  const stored = localStorage.getItem("ollama_host");
  if (stored) return stored;

  const runtime = getRuntimeConfig().ollamaHost;
  if (runtime && typeof runtime === "string") return runtime;

  return DEFAULT_OLLAMA_HOST;
}

export function setOllamaHost(host: string): void {
  localStorage.setItem("ollama_host", host);
}

export function getApiKey(): string | null {
  return localStorage.getItem("ollama_api_key");
}

export function setApiKey(key: string | null): void {
  if (key) {
    localStorage.setItem("ollama_api_key", key);
  } else {
    localStorage.removeItem("ollama_api_key");
  }
}

export function getOllamaDotComUrl(): string {
  const stored = localStorage.getItem("ollama_dot_com_url");
  if (stored) return stored;

  const runtime = getRuntimeConfig().ollamaDotComUrl;
  if (runtime && typeof runtime === "string") return runtime;

  return "https://ollama.com";
}

export function setOllamaDotComUrl(url: string): void {
  localStorage.setItem("ollama_dot_com_url", url);
}

export function getCorsProxyUrl(): string | null {
  const stored = localStorage.getItem("ollama_cors_proxy");
  if (stored) return stored;

  const runtime = getRuntimeConfig().corsProxyUrl;
  if (runtime === null) return null;
  if (runtime && typeof runtime === "string") return runtime;

  return null;
}

export function setCorsProxyUrl(url: string | null): void {
  if (url) {
    localStorage.setItem("ollama_cors_proxy", url);
  } else {
    localStorage.removeItem("ollama_cors_proxy");
  }
}