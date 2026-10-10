// Runs on claude.ai. Acts only in a tab the extension opened for an Atlas job: turns on Research and
// types the prompt. The user presses send; then it watches for the ATLAS_RESULT block and hands it to Atlas.

const SEL = {
  input: '[data-testid="chat-input"]',
  attach: '[data-testid="chat-input-attach"]',
  researchItem: '[data-testid="add-menu-research"]',
  researchPill: 'button[aria-label="Research mode"]',
  send: '[data-testid="chat-input-send"]',
  // Research reports open as a document in a side panel.
  artifactPanel: '[aria-label^="Artifact panel"]',
};
const VERDICTS = ["consider_buying", "consider_selling", "hold_and_watch", "not_enough_info"];
// false = fill everything in and leave the send button to the user; true = press send too.
const AUTO_SEND = false;
const SEND_WAIT_MS = 30 * 60 * 1000;
const POLL_MS = 5000;
const MAX_WAIT_MS = 45 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 20000, everyMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

function ask(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (r) => resolve(r || {})));
}

// ---------- Status badge ----------

let badge;
function status(text, tone = "info", link) {
  if (!badge) {
    badge = document.createElement("div");
    badge.setAttribute("role", "status");
    badge.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:10px 14px;border-radius:12px;" +
      "font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);color:#fff";
    document.body.appendChild(badge);
  }
  badge.style.background = tone === "error" ? "#8a4b16" : tone === "done" ? "#2f6b5f" : "#3c5a99";
  badge.textContent = "Atlas · " + text;
  // Mirror progress into the Atlas tab.
  if (tone !== "error") chrome.runtime.sendMessage({ type: "claude:status", text }, () => void chrome.runtime.lastError);
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.textContent = " Open Atlas ↗";
    a.style.cssText = "color:#fff;font-weight:600;margin-left:4px";
    a.target = "_blank";
    badge.appendChild(a);
  }
}

// ---------- Start: Research on, prompt in, send ----------

/** Research mode is on when its pill is pressed (and a "/deep-research" chip sits in the input). */
const researchOn = () => Boolean(document.querySelector(SEL.researchPill + '[aria-pressed="true"]'));

let lastResearchProblem = "";
async function ensureResearchOn() {
  // The page may still be hydrating, and the menu item is a toggle: keep trying until the pill shows.
  for (let attempt = 0; attempt < 8; attempt++) {
    if (researchOn()) return true;
    let item = document.querySelector(SEL.researchItem);
    if (!item) {
      const attach = await waitFor(() => document.querySelector(SEL.attach), 10000);
      if (!attach) {
        lastResearchProblem = "no + button";
        continue;
      }
      attach.click();
      item = await waitFor(() => document.querySelector(SEL.researchItem), 2500);
    }
    if (!item) {
      lastResearchProblem = "menu had no Research item";
      await sleep(1000);
      continue;
    }
    item.click();
    if (await waitFor(researchOn, 2000)) return true;
    lastResearchProblem = `Research item was ${item.getAttribute("aria-checked") === "true" ? "on" : "off"} but no Research pill appeared`;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(800);
  }
  return researchOn();
}

async function typePrompt(prompt) {
  const input = await waitFor(() => document.querySelector(SEL.input));
  if (!input) return false;
  // Research mode puts a "/deep-research" chip in the input: type after it, never clear it.
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, " " + prompt);
  return Boolean(await waitFor(() => input.innerText.includes("ATLAS_RESULT"), 5000));
}

/** claude.ai keeps an unsent draft between visits; start from an empty box. */
async function clearDraft() {
  const input = await waitFor(() => document.querySelector(SEL.input));
  if (!input || !input.innerText.trim()) return;
  input.focus();
  document.execCommand("selectAll");
  document.execCommand("delete");
  await sleep(300);
}

async function start(job) {
  status(`Setting up Deep Research on ${job.ticker || "this stock"}…`);
  await clearDraft();
  if (!(await ensureResearchOn())) return fail(`Couldn't turn on Research mode (${lastResearchProblem || "unknown"}).`);
  if (!(await typePrompt(job.prompt))) return fail("Couldn't type the prompt into Claude.");
  if (!researchOn()) return fail("Research mode switched off while typing.");
  if (AUTO_SEND) {
    const send = await waitFor(() => {
      const b = document.querySelector(SEL.send);
      return b && !b.disabled ? b : null;
    }, 10000);
    if (!send) return fail("Claude's send button didn't become ready.");
    send.click();
  } else {
    status(`Research mode is on and the prompt for ${job.ticker || "this stock"} is filled in. Check it, then press send.`);
  }
  // Claude moves to /chat/<id> once the message is sent; lock the watcher to that chat.
  const chatPath = await waitFor(
    () => (/^\/chat\/[\w-]+$/.test(location.pathname) ? location.pathname : null),
    AUTO_SEND ? 30000 : SEND_WAIT_MS,
    500,
  );
  if (!chatPath) return fail(AUTO_SEND ? "Claude didn't open a chat for the research." : "The prompt wasn't sent within 30 minutes, so Atlas stopped waiting.");
  await ask({ type: "claude:chat", path: chatPath });
  status(`Deep Research on ${job.ticker || "this stock"} is running (about 10 minutes). Keep this tab open; the result goes to Atlas by itself.`);
  watch({ ...job, chatPath });
}

// ---------- Watch for the result ----------

/** First balanced {...} after `from`, respecting JSON strings. */
function balancedObject(text, from) {
  const startAt = text.indexOf("{", from);
  if (startAt < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = startAt; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(startAt, i + 1);
  }
  return null;
}

/** A real answer (not the template in our own prompt): valid verdict and at least one source. */
function findResult(text) {
  let at = text.lastIndexOf("ATLAS_RESULT");
  while (at >= 0) {
    const json = balancedObject(text, at);
    if (json) {
      try {
        const d = JSON.parse(json);
        if (VERDICTS.includes(d.verdict) && typeof d.confidence === "number" && Array.isArray(d.sources) && d.sources.length > 0) {
          return { json, at };
        }
      } catch {
        // still streaming, or the template
      }
    }
    at = text.lastIndexOf("ATLAS_RESULT", at - 1);
  }
  return null;
}

/** All text Claude has shown in the chat. */
function pageText() {
  return document.body ? document.body.innerText : "";
}

const BLOCKS = new Set(["P", "LI", "PRE", "TR", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "UL", "OL"]);

/**
 * Text of an element with line breaks between blocks. innerText skips parts of a long report that
 * are scrolled out of view, so this walks textContent instead.
 */
function blockText(root) {
  const copy = root.cloneNode(true);
  // Toolbar buttons ("Copy", "Publish") are not part of the report.
  for (const el of copy.querySelectorAll("button")) el.remove();
  for (const el of copy.querySelectorAll("*")) if (BLOCKS.has(el.tagName)) el.after("\n");
  return copy.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

/** Reports open in the side panel, as text. */
function reportTexts() {
  // Read the document body, not the panel's toolbar ("Copy", "Publish").
  return [...document.querySelectorAll(SEL.artifactPanel)].map((panel) => blockText(panel.querySelector('[class*="standard-markdown"]') || panel));
}

/** Open the newest research document in this chat so its text is on the page. */
let lastOpenAttempt = 0;
function openLatestReport() {
  if (Date.now() - lastOpenAttempt < 30000) return;
  const cards = [...document.querySelectorAll("button")].filter((b) => /(Document|Artifact)\s*$/.test(b.textContent || ""));
  if (!cards.length) return;
  lastOpenAttempt = Date.now();
  cards[cards.length - 1].click();
}

/** The answer itself: from the end of our prompt (its last line is the JSON template) to the result block. */
function reportText(text, found) {
  const templateEnd = text.lastIndexOf('"sources":[{"title":"...","url":"https://..."}]}', found.at);
  const from = templateEnd >= 0 ? text.indexOf("\n", templateEnd) + 1 : Math.max(0, found.at - 20000);
  // Drop the closing fence of the prompt's template block.
  return text.slice(from, found.at).replace(/^\s*```\s*\n/, "") + "ATLAS_RESULT\n" + found.json;
}

async function watch(job) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    // Only read the research chat; if the user browses elsewhere in this tab, wait until they come back.
    if (job.chatPath && location.pathname !== job.chatPath) continue;
    // The result block is at the end of the research document; check open reports first, then the chat.
    let text = "";
    let found = null;
    let inReport = false;
    for (const r of reportTexts()) {
      const f = findResult(r);
      if (f) [text, found, inReport] = [r, f, true];
    }
    if (!found) {
      text = pageText();
      found = findResult(text);
    }
    if (!found) {
      openLatestReport();
      continue;
    }
    // Same block on two polls in a row = Claude has finished writing it.
    if (last !== found.json) {
      last = found.json;
      status("Claude is finishing the report…");
      continue;
    }
    status("Sending the result to Atlas…");
    const report = inReport ? text.slice(0, found.at) + "ATLAS_RESULT\n" + found.json : reportText(text, found);
    const r = await ask({ type: "claude:result", jobId: job.id, text: report });
    if (r.ok) status(`Done. The ${job.ticker || ""} card is in Atlas.`, "done", r.atlasUrl);
    else status(`Atlas couldn't import it: ${r.error}. Copy the answer and paste it into Atlas instead.`, "error");
    return;
  }
  fail("No ATLAS_RESULT block after 45 minutes. Copy Claude's answer into Atlas by hand.");
}

async function fail(error) {
  status(error, "error");
  await ask({ type: "claude:failed", error });
}

// ---------- Entry ----------

(async () => {
  const claim = await ask({ type: "claude:claim" });
  if (claim.job) return start(claim.job);
  // A reload of the research tab lands here: keep watching the same chat.
  const resumed = await ask({ type: "claude:resume" });
  if (resumed.job) {
    status(`Deep Research on ${resumed.job.ticker || "this stock"} is running. Keep this tab open.`);
    watch(resumed.job);
  }
})();
