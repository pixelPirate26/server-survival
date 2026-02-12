// Shared frontend runtime config.
// `window.SERVER_API_URL` can be set by `env-config.js` generated from `.env`.
(function setServerApiUrl() {
  const configuredValue =
    typeof window.SERVER_API_URL === "string" ? window.SERVER_API_URL.trim() : "";
  const fallbackValue = "http://localhost:8787/api";
  const normalizedValue = (configuredValue || fallbackValue).replace(/\/+$/, "");
  window.SERVER_API_URL = normalizedValue;
})();
