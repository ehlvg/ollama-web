const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";

export function getOllamaHost(): string {
  const stored = localStorage.getItem("ollama_host");
  return stored || DEFAULT_OLLAMA_HOST;
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
  return localStorage.getItem("ollama_dot_com_url") || "https://ollama.com";
}

export function setOllamaDotComUrl(url: string): void {
  localStorage.setItem("ollama_dot_com_url", url);
}

export function getCorsProxyUrl(): string | null {
  return localStorage.getItem("ollama_cors_proxy");
}

export function setCorsProxyUrl(url: string | null): void {
  if (url) {
    localStorage.setItem("ollama_cors_proxy", url);
  } else {
    localStorage.removeItem("ollama_cors_proxy");
  }
}