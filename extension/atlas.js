// Runs on the Atlas web app (localhost, or an address added on the options page). Turns Atlas's own "Deep research in Claude" links into one-click
// jobs for the extension, and tells the page what the Claude tab is doing.

// Set after load so React's hydration of <html> isn't disturbed.
const markReady = () => (document.documentElement.dataset.atlasExtension = "ready");
if (document.readyState === "complete") markReady();
else window.addEventListener("load", markReady, { once: true });

document.addEventListener(
  "click",
  (event) => {
    // Only links Atlas itself marked (never a source link inside a report), and only real user clicks.
    const link = event.target instanceof Element ? event.target.closest("a[data-atlas-claude][href^='https://claude.ai/new?q=']") : null;
    if (!link || !event.isTrusted || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const prompt = new URL(link.href).searchParams.get("q");
    if (!prompt) return;
    event.preventDefault();
    event.stopPropagation();
    // "Stock: NVIDIA CORP (NVDA)" or "Stock: NVDA"
    const ticker = (prompt.match(/^Stock: (?:.*\()?([A-Z.\-]{1,10})\)?$/m) || [])[1] || "";
    const fallback = () => window.open(link.href, "_blank", "noopener");
    try {
      chrome.runtime.sendMessage({ type: "atlas:start", prompt, ticker }, (reply) => {
        if (chrome.runtime.lastError || !reply) return fallback();
        const name = reply.ok ? "atlas:claude-started" : "atlas:claude-error";
        window.dispatchEvent(new CustomEvent(name, { detail: reply.ok ? { ticker } : { ticker, error: reply.error } }));
      });
    } catch {
      // The extension was reloaded and this page still has the old script: open the link the normal way.
      fallback();
    }
  },
  true,
);

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "atlas:import") {
    // The finished report, from the extension. Post it from this page so Atlas's own sign-in cookie goes with it.
    if (typeof msg.text !== "string") return;
    const ticker = typeof msg.ticker === "string" ? msg.ticker : "";
    fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text, ticker: ticker || undefined }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return reply({ ok: false, error: data.error || `Atlas said ${res.status}` });
        window.dispatchEvent(new CustomEvent("atlas:imported", { detail: { type: "atlas:imported", ticker } }));
        reply({ ok: true });
      })
      .catch((e) => reply({ ok: false, error: String((e && e.message) || e) }));
    return true; // async reply
  }
  if (["atlas:imported", "atlas:claude-status", "atlas:claude-error"].includes(msg.type)) {
    window.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
  }
});
