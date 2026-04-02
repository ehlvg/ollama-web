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
  const stored = localStorage.getItem("ollama_host");
  if (stored) {
    // Avoid mixed-content failures when the UI is served over HTTPS.
    // If the user previously saved a docker-internal or loopback HTTP host,
    // prefer the same-origin reverse proxy instead.
    if (typeof window !== "undefined" && window.location?.protocol === "https:") {
      const trimmed = stored.trim();
      if (trimmed.startsWith("http://")) {
        try {
          const u = new URL(trimmed);
          const isLocalish =
            u.hostname === "localhost" ||
            u.hostname === "127.0.0.1" ||
            u.hostname === "0.0.0.0" ||
            u.hostname === "ollama";
          if (isLocalish) return "/ollama";
        } catch {
          return "/ollama";
        }
      }
    }
    return normalizeOllamaHost(stored);
  }

  const runtime = getRuntimeConfig().ollamaHost;
  if (runtime && typeof runtime === "string") return normalizeOllamaHost(runtime);

  return normalizeOllamaHost(DEFAULT_OLLAMA_HOST);
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