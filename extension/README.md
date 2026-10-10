# Atlas Deep Research (Chrome extension)

One click in Atlas opens claude.ai with Research mode on and the prompt filled in. You press send, and the result comes back to Atlas as a research card by itself. Without this extension you do it all by hand: turn on Research, press send, wait, then copy and paste the answer.

The research runs on your own Claude plan, so it costs Atlas nothing. The import is plain code (`src/lib/handoff.ts`), with no API call.

## What's in this folder

| File | What it does |
|---|---|
| `manifest.json` | Chrome extension setup (Manifest V3). Asks for `storage`, `scripting`, access to `claude.ai` and `localhost` / `127.0.0.1`, and optionally one Atlas address at a time (see below). |
| `atlas.js` | Runs on the Atlas web app (localhost, or an address you added). Catches clicks on *Deep research in Claude* / *Go deeper in Claude* links and passes the prompt to the extension. Shows Claude's progress in Atlas and posts the finished report to `/api/import` from the Atlas page. |
| `background.js` | Holds one job per Claude tab it opened, hands the finished report to your open Atlas tab, and registers the Atlas script on the addresses you added. |
| `options.html`, `options.js` | The page (toolbar icon) where you add the address of a hosted Atlas. |
| `origins.js` | Checks which addresses count as Atlas. Shared by the two above; tested in `tests/origins.test.ts`. |
| `claude.js` | Runs on claude.ai, but only acts in the tab the extension opened. Turns on Research mode and types the prompt, waits for you to press send, shows a status badge and watches for the result. |

## Set up (first time)

You need three things: a paid Claude plan, Atlas (on your computer or hosted), and this extension. About five minutes.

**1. A paid Claude plan.** Claude's Research mode (Deep Research) is not on the free plan. You need Pro or higher: Max has it too, and Team and Enterprise list it (check [claude.com/pricing](https://claude.com/pricing) for your plan). Sign in to claude.ai in the same Chrome you will use for Atlas.
   *Check:* in a new Claude chat, click **+**. If you see **Research**, you are set.

**2. Atlas open.** Either run it on your computer ("Run it" in the main README, then http://localhost:3000, which needs no extra setup), or use a hosted copy and add its address in step 3.

**3. Install the extension.**
   - Open the **Claude setup** tab in Atlas and click **Download the extension**. Unzip it somewhere permanent, open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and choose the unzipped folder.
   - Or use this repo's `extension` folder directly: **Load unpacked** and choose it.
   - From the Chrome Web Store, if it is listed there: search for **Atlas Deep Research** and click **Add to Chrome**.

   **Hosted Atlas only:** click the extension's toolbar icon (puzzle piece → **Atlas Deep Research**), type your Atlas address (for example `https://your-atlas.vercel.app`) and click **Add address**. Chrome asks you to allow access to that one address. Remove it there any time.

   Then reload the Atlas tab so the extension can attach to it.
   *Check:* in Atlas, Settings → Claude Deep Research shows **Extension installed**.

**4. Run your first research.**
   1. In Atlas, open Chat, choose **Research a stock**, type a ticker (for example `AAPL`) and click **Deep research in Claude**.
   2. A Claude tab opens with Research turned on and the prompt filled in. Read it and press **send**.
   3. Keep that tab open. It takes about 10 minutes. A badge in the corner shows progress.
   4. When it finishes, the research card appears in your Inbox in Atlas. Nothing is bought or sold unless you approve it there.

**5. Optional, for better results.**
   - Connect SnapTrade to Claude so it reads your real holdings (steps at the end of this file).
   - Install the Atlas research skill from `claude-skill/` (see the main README). It adds detailed checklists and a fixed report format.

If something does not work, see Troubleshooting below. Without the extension everything still works by hand: the link opens Claude with the prompt filled in, you turn on Research and press send, and you paste the answer into Atlas under Settings.

After you edit any file in this folder, press the reload icon on the extension's card in `chrome://extensions`, then reload the Atlas tab.

## The one-click flow

1. In Atlas, click **Deep research in Claude** (on a scan card or in the composer) or **Go deeper in Claude** (under a research card). Each of these is a link to `https://claude.ai/new?q=<prompt>`.
2. `atlas.js` stops the normal link and sends the prompt to the extension.
3. `background.js` saves a one-off job (it expires after 5 minutes if nothing picks it up) and opens a new claude.ai tab.
4. In that tab, `claude.js` claims the job. Only the tab the extension just opened can claim it.
5. It turns on **Research** mode through the **+** menu. A `/deep-research` chip appears in the message box.
6. It types the prompt after the chip and stops. **You press send**, so nothing runs on your Claude plan until you have seen the prompt. (To have the extension press send too, set `AUTO_SEND = true` at the top of `claude.js`.)
7. A status badge appears in the bottom-right corner of the Claude tab. The same progress shows in Atlas, above the composer.
8. Deep Research runs for about 10 minutes. Keep the Claude tab open (and, for a hosted Atlas, an Atlas tab). It's fine if the page moves from `/new` to `/chat/...` or you reload it; the extension keeps watching.
9. Every 5 seconds the extension reads the page and looks for an `ATLAS_RESULT` JSON block with a valid verdict and at least one source. The JSON template inside the prompt itself doesn't count.
10. When the same block shows up on two checks in a row, Claude has finished writing it. `background.js` hands the report to an open Atlas tab on the same address, and `atlas.js` posts it to `/api/import` from that page, so a hosted Atlas sees its own sign-in cookie. (Atlas on localhost with no open tab is posted to directly.)
11. Atlas parses it with plain code and posts a research card. The badge turns green and links back to Atlas.

**Without the extension**, the same link just opens claude.ai with the prompt filled in. Turn on Research yourself (**+** → Research), press send, wait for the report, then copy Claude's whole answer into **Bring back a Claude report** in Atlas.

Ctrl-, Cmd- and Shift-clicks are left alone, so you can still open the link in a new tab the normal way.

## Security model

- **Only Atlas can start a job.** The background script accepts a start message only from `http://localhost` / `http://127.0.0.1` (any port) or an `https://` address you added yourself and Chrome let it reach. The prompt must start with the Atlas prompt line and be under 20,000 characters.
- **Atlas addresses are yours to approve.** Each added address gets its own Chrome permission prompt, https only, no wildcards, never `claude.ai`. Removing it also takes the permission back.
- **Only the tab the extension opened can act on it.** The job remembers that tab's ID. Any other claude.ai tab that asks gets nothing, and so does the same tab once the job is done, failed or older than 5 minutes.
- **Random `claude.ai/new?q=` links never trigger anything.** A link from an email, another site or your history opens claude.ai as usual, because no job is waiting for that tab.
- **It never touches other tabs.** Your other Claude chats are never read or changed. The report goes only to a tab on the Atlas address that started the job.
- **One job per Claude tab.** Each click opens its own tab with its own job, so two researches can run side by side. Jobs are kept in session storage, which Chrome clears when the browser closes, and a job is forgotten when its tab closes.
- **Nothing trades.** The extension only brings back a research card. Trades still need your click in Atlas.

## What the status badge means

The badge sits in the bottom-right corner of the Claude tab and always starts with "Atlas ·".

| Colour | Meaning |
|---|---|
| Blue | Working. Leave the tab open. |
| Green | Done. The card is in Atlas (the badge has an **Open Atlas ↗** link). |
| Orange-brown | Something went wrong. The message says what to do. |

| Message | Meaning |
|---|---|
| Setting up Deep Research on NVDA… | Turning on Research mode and typing the prompt. |
| Research mode is on and the prompt for NVDA is filled in. Check it, then press send. | Your turn: press send in the Claude tab. |
| Deep Research on NVDA is running (about 10 minutes)… | The prompt was sent. Wait. |
| Claude is finishing the report… | The result block appeared; checking it has stopped changing. |
| Sending the result to Atlas… | Posting the report to Atlas. |
| Done. The NVDA card is in Atlas. | Finished. |
| Couldn't turn on Research mode (…) | See troubleshooting below. |
| Couldn't type the prompt into Claude. / Claude's send button didn't become ready. / Research mode switched off while typing. | The claude.ai page didn't behave as expected. Reload the extension and the Atlas tab, then click again. |
| Atlas couldn't import it: … | Atlas rejected the report (for example, it isn't running). Copy the answer and paste it into Atlas instead. |
| The prompt wasn't sent within 30 minutes, so Atlas stopped waiting. | You didn't press send. Click the link in Atlas again. |
| No ATLAS_RESULT block after 45 minutes. | See troubleshooting below. |

Errors also show in Atlas, above the composer.

## Troubleshooting

- **"Couldn't turn on Research mode"**: reload the extension in `chrome://extensions`, then reload the Atlas tab and click again. Check that your Claude plan has Research.
- **No result after 45 minutes**: the extension stops watching. If Claude did finish, copy its whole answer (including the `ATLAS_RESULT` block at the end) and paste it into **Bring back a Claude report** in Atlas. If the block is missing, ask Claude to send just that block.
- **Clicking the link opens claude.ai but nothing happens**: the extension isn't attached to the Atlas tab. Reload the Atlas tab. On a hosted Atlas, check its address is in the extension's list (toolbar icon). If that doesn't help, check the extension is turned on, then reload it.
- **"Atlas couldn't import it"**: make sure Atlas is still running, and for a hosted Atlas that a tab on it is open and signed in. Then paste the answer by hand.
- **claude.ai changed its page**: the buttons the extension clicks are found by the selectors in `SEL`, at the top of `claude.js` (message box, **+** button, Research menu item, Research pill, send button). Update them, then reload the extension.

## Let Claude read your real holdings (SnapTrade connector)

The prompt asks Claude to read your actual holdings through SnapTrade, if the connector is set up. To set it up on claude.ai:

1. Go to **Customize → Connectors**.
2. Click **Add → Add custom connector**.
3. Name: `SnapTrade`. URL: `https://mcp.snaptrade.com/mcp`.
4. Click **Connect** and approve read access in SnapTrade.
5. Optional: set the read-only tools to **Always allow**, so Deep Research doesn't stop to ask.

This connector only reads. Trades still happen only when you click approve in Atlas.
