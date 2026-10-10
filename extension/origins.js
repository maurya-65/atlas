// Which Atlas addresses the extension may talk to. Shared by the background script (importScripts) and the
// options page (<script>); tests/origins.test.ts loads it too, so it stays plain JS with no dependencies.
(function (root) {
  const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  /** localhost / 127.0.0.1, any port: always allowed, no setup needed. */
  const isLocalOrigin = (origin) => LOCAL.test(origin);

  /**
   * What the user typed ("atlas.vercel.app", "https://atlas.vercel.app/#inbox") as a bare origin, or null if it
   * isn't an address Atlas may live at. Remote addresses must be https, a real hostname and the default port.
   * claude.ai is refused so Atlas's script is never injected there.
   */
  function normalizeOrigin(input) {
    if (typeof input !== "string") return null;
    let text = input.trim();
    if (!text || /\s/.test(text)) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(text) ? "http://" : "https://") + text;
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.username || url.password) return null;
    if (isLocalOrigin(url.origin)) return url.origin;
    if (url.protocol !== "https:" || url.port) return null;
    const host = url.hostname;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
    if (host === "claude.ai" || host.endsWith(".claude.ai")) return null;
    return url.origin;
  }

  const api = { isLocalOrigin, normalizeOrigin };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AtlasOrigins = api;
})(typeof self !== "undefined" ? self : globalThis);
