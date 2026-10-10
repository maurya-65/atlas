// Holds research jobs, one per Claude tab this extension opened from an Atlas click, so only those tabs
// can act (a random claude.ai link never triggers anything). Hands finished reports back to Atlas.

importScripts("origins.js");
const { isLocalOrigin } = self.AtlasOrigins;

const JOB_TTL_MS = 5 * 60 * 1000;
// Must match the first line of buildClaudePrompt in src/lib/handoff.ts.
const PROMPT_PREFIX = "Please run a Deep Research on this stock for Atlas";

async function getJobs() {
  const { jobs } = await chrome.storage.session.get("jobs");
  return jobs || {};
}

async function saveJobs(jobs) {
  await chrome.storage.session.set({ jobs });
}

/** The job for this tab, if any (keys are tab ids as strings). */
async function jobFor(sender) {
  if (!sender.tab) return null;
  return (await getJobs())[String(sender.tab.id)] || null;
}

async function updateJob(tabId, patch) {
  const jobs = await getJobs();
  const key = String(tabId);
  if (!jobs[key]) return;
  jobs[key] = { ...jobs[key], ...patch };
  await saveJobs(jobs);
}

function notifyAtlas(job, message) {
  if (job && job.atlasTabId != null) chrome.tabs.sendMessage(job.atlasTabId, message).catch(() => {});
}

// Forget a job when its Claude tab closes.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const jobs = await getJobs();
  if (jobs[String(tabId)]) {
    delete jobs[String(tabId)];
    await saveJobs(jobs);
  }
});

// ---------- Atlas addresses ----------
// localhost always works (its content script is in the manifest). Any other Atlas address, such as a hosted
// copy, is added by the user on the options page, which also asks Chrome for access to that one address.

/** Atlas addresses the user added (not counting localhost). */
async function addedOrigins() {
  const { atlasOrigins } = await chrome.storage.local.get("atlasOrigins");
  return Array.isArray(atlasOrigins) ? atlasOrigins : [];
}

const scriptId = (origin) => "atlas-" + new URL(origin).hostname;

/** Make the registered Atlas content scripts match the added addresses that Chrome still lets us reach. */
let syncing = Promise.resolve();
function syncScripts() {
  syncing = syncing.catch(() => {}).then(async () => {
    const wanted = [];
    for (const origin of await addedOrigins()) {
      if (await chrome.permissions.contains({ origins: [origin + "/*"] })) wanted.push(origin);
    }
    const have = await chrome.scripting.getRegisteredContentScripts();
    const stale = have.filter((s) => s.id.startsWith("atlas-") && !wanted.some((o) => scriptId(o) === s.id)).map((s) => s.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
    const missing = wanted.filter((o) => !have.some((s) => s.id === scriptId(o)));
    if (missing.length) {
      await chrome.scripting.registerContentScripts(
        missing.map((o) => ({ id: scriptId(o), matches: [o + "/*"], js: ["atlas.js"], runAt: "document_start" })),
      );
    }
  });
  return syncing.catch((e) => console.error("Atlas: couldn't update Atlas addresses", e));
}

chrome.runtime.onInstalled.addListener(syncScripts);
chrome.runtime.onStartup.addListener(syncScripts);
chrome.permissions.onRemoved.addListener(syncScripts);
chrome.storage.onChanged.addListener((changes, area) => area === "local" && changes.atlasOrigins && syncScripts());
// The toolbar icon opens the page where Atlas addresses are added.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

/** True when `origin` is localhost or an address the user added. */
async function isAtlasOrigin(origin) {
  return isLocalOrigin(origin) || (await addedOrigins()).includes(origin);
}

// ---------- Handing the result to Atlas ----------

/** Ask an open Atlas tab on the job's address to import the report (it posts from the page, with its own sign-in). */
async function importViaAtlasTab(job, text) {
  const tabs = await chrome.tabs.query({ url: job.atlasOrigin + "/*" });
  // The tab that started the job first, then any other tab on the same address.
  tabs.sort((a, b) => Number(b.id === job.atlasTabId) - Number(a.id === job.atlasTabId));
  for (const tab of tabs) {
    try {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: "atlas:import", text, ticker: job.ticker || undefined });
      if (reply) return reply;
    } catch {
      // that tab has no Atlas script (loaded before the extension, or not Atlas): try the next one
    }
  }
  return null;
}

async function importReport(job, text) {
  const viaTab = await importViaAtlasTab(job, text);
  if (viaTab) {
    if (!viaTab.ok) throw new Error(viaTab.error || "Atlas said no.");
    return;
  }
  // No Atlas tab is open. Atlas on this computer has no sign-in by default, so post to it directly.
  if (!isLocalOrigin(job.atlasOrigin)) throw new Error(`no Atlas tab is open at ${job.atlasOrigin}`);
  const res = await fetch(`${job.atlasOrigin}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ticker: job.ticker || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Atlas said ${res.status}`);
  notifyAtlas(job, { type: "atlas:imported", ticker: job.ticker });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === "atlas:start") {
      // Only the Atlas content script (localhost or an address the user added) may start a job, and only with an Atlas prompt.
      const origin = sender.origin || (sender.url ? new URL(sender.url).origin : "");
      if (!(await isAtlasOrigin(origin))) return reply({ ok: false, error: "Not from Atlas." });
      if (typeof msg.prompt !== "string" || msg.prompt.length > 20000 || !msg.prompt.startsWith(PROMPT_PREFIX)) {
        return reply({ ok: false, error: "That isn't an Atlas research prompt." });
      }
      try {
        // The tab starts on about:blank so its content script can't run before the job is saved.
        const tab = await chrome.tabs.create({ url: "about:blank", active: true });
        const jobs = await getJobs();
        jobs[String(tab.id)] = {
          id: crypto.randomUUID(),
          prompt: msg.prompt,
          ticker: /^[A-Z.\-]{1,10}$/.test(msg.ticker || "") ? msg.ticker : "",
          atlasOrigin: origin,
          atlasTabId: sender.tab ? sender.tab.id : null,
          createdAt: Date.now(),
          state: "pending",
        };
        await saveJobs(jobs);
        // Don't let Memory Saver discard the tab while the research runs in the background.
        await chrome.tabs.update(tab.id, { url: "https://claude.ai/new", autoDiscardable: false });
        return reply({ ok: true });
      } catch (e) {
        return reply({ ok: false, error: `Couldn't open Claude: ${e.message || e}` });
      }
    }

    if (msg.type === "claude:claim") {
      const job = await jobFor(sender);
      const fresh = job && job.state === "pending" && Date.now() - job.createdAt < JOB_TTL_MS;
      if (!fresh) return reply({ job: null });
      await updateJob(sender.tab.id, { state: "running" });
      return reply({ job: { id: job.id, prompt: job.prompt, ticker: job.ticker } });
    }

    if (msg.type === "claude:resume") {
      // The Claude tab reloaded while the research ran: keep watching the same chat.
      const job = await jobFor(sender);
      if (!job || job.state !== "running") return reply({ job: null });
      return reply({ job: { id: job.id, ticker: job.ticker, chatPath: job.chatPath || null } });
    }

    if (msg.type === "claude:chat") {
      // Remember which chat the research lives in, so the watcher never reads another conversation.
      const job = await jobFor(sender);
      if (job && typeof msg.path === "string" && /^\/chat\/[\w-]+$/.test(msg.path)) await updateJob(sender.tab.id, { chatPath: msg.path });
      return reply({ ok: true });
    }

    if (msg.type === "claude:status") {
      const job = await jobFor(sender);
      if (job) notifyAtlas(job, { type: "atlas:claude-status", ticker: job.ticker, text: msg.text });
      return reply({ ok: true });
    }

    if (msg.type === "claude:result") {
      const job = await jobFor(sender);
      if (!job || job.id !== msg.jobId || job.state !== "running") return reply({ ok: false, error: "No matching job." });
      try {
        await importReport(job, msg.text);
        await updateJob(sender.tab.id, { state: "done" });
        return reply({ ok: true, atlasUrl: job.atlasOrigin });
      } catch (e) {
        notifyAtlas(job, { type: "atlas:claude-error", ticker: job.ticker, error: String(e.message || e) });
        return reply({ ok: false, error: String(e.message || e) });
      }
    }

    if (msg.type === "claude:failed") {
      const job = await jobFor(sender);
      if (job) {
        await updateJob(sender.tab.id, { state: "failed" });
        notifyAtlas(job, { type: "atlas:claude-error", ticker: job.ticker, error: msg.error });
      }
      return reply({ ok: true });
    }

    reply({});
  })();
  return true; // async reply
});
