// Optional runtime config for static hosting.
// Copy to `public/config.js` (or serve `/config.js`) to set defaults without rebuilding.
//
// Notes:
// - User changes in Settings (localStorage) override this.
// - `ollamaHost` can be a relative URL like "/ollama" when you reverse-proxy Ollama behind the same domain.
// - `corsProxyUrl` should typically be "/proxy" when you run the included CORS proxy container.
//
// eslint-disable-next-line no-undef
window.__OLLAMA_WEB_CONFIG__ = {
  ollamaHost: "/ollama",
  corsProxyUrl: "/proxy",
  ollamaDotComUrl: "https://ollama.com",
};

