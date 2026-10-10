# Atlas

An investing app where the AI agent *is* the product. Atlas watches your real brokerage account through SnapTrade. It reads public SEC filings, news and Federal Register notices about what you own and what you care about, then tells you in plain words when something matters. It never trades on its own: every trade comes from a decision card you click.

**Features:**
- **Daily run.** Turn it on and, once a day at the time you pick, Atlas looks at your portfolio, deep-researches the holding whose turn it is, and posts a *daily brief*: what changed since the last run, what your rules flagged, and the analysts' verdict. Buy and sell suggestions arrive as cards you can try in **paper mode** with one click (always simulated, even if the app is in live mode). The watch list follows your holdings by itself: a stock you buy joins it, a stock you sell drops out.
- **Deep research with debating agents.** Research one stock, or press *Review my portfolio* to research your 3 biggest holdings. Four analyst agents each dig into one angle (business & market, regulation & legal, industry & competition, people & operations) and write a short report where every claim cites a numbered source. Then each analyst reads the others' reports and pushes back (one debate round). A *judge* weighs the debate and says **buy more, sell some or hold**, with a **0-100 confidence score**, the reason, and buy/sell buttons that only act when you click.
- **Claude Deep Research hand-off.** When a scan flags material news, or on any research card, Atlas offers *Deep research in Claude*: it opens claude.ai with a ready prompt (your position, the flagged news, five analyst angles, a debate and a judge). It runs about 10 minutes on your Claude plan, so it costs Atlas nothing. Claude ends with an `ATLAS_RESULT` JSON block; paste the answer into *Bring back a Claude report* and Atlas turns it into a card with plain parsing, no API call (`src/lib/handoff.ts`). While Atlas's own quick research runs, the *live agent room* shows what each analyst reads, writes and argues.
- **What-if deep agent.** Ask "what if Taiwan blocks chip exports?" and agents work it out step by step. A *planner* splits the scenario into the ways it could spread. *Researcher* agents read public news and government notices in parallel, one per way. A *synthesizer* maps the impact onto your **real SnapTrade holdings**: cause → effect path, rough dollar range, recommendation and sources.
- **Seatbelt for AI trading.** The same tools plug into Claude as an MCP server, next to SnapTrade's own connector. Claude can analyse and *propose*, but money only moves when you click approve in Atlas, and live trades are capped in server code, not in a prompt.

Built for SnapTrade Hack Atlantic 2026 (Student Challenge).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000
```

| Variable | What it's for |
|---|---|
| `ATLAS_ANTHROPIC_API_KEY` | Claude. Every call is research, and all of it runs on Opus 5.5 (deep research at high effort). This name wins over any `ANTHROPIC_API_KEY` already set in your shell. |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | SnapTrade dashboard → API keys. Without them the app runs on a clearly labelled demo portfolio. |
| `SNAPTRADE_AUTH_MODE` | `personal` (default) is for keys from the SnapTrade dashboard. Brokerages are linked in the dashboard (for example the built-in **SnapTrade Sandbox**, which supports trading with fake money) or through the Connect button, and no user registration is needed. Use `commercial` for app keys, where Atlas registers a SnapTrade user itself. |
| `SNAPTRADE_BROKER` | Optional. For example `ALPACA-PAPER` opens the connection portal straight on that broker. |
| `SEC_USER_AGENT` | Optional contact string, which SEC EDGAR asks for. |

State is kept in `.data/store.json` (one user). The **Reset demo** button clears it but keeps the brokerage connection.

## How SnapTrade is used

- **Connect:** SnapTrade's hosted connection portal (`loginSnapTradeUser`, `connectionType: "trade"`).
- **Read:** accounts, holdings, cash and recent orders (`listUserAccounts`, `getUserHoldings`), plus live quotes (`getUserAccountQuotes`). The rules and the agent run on these real numbers.
- **Paper mode:** a simulated copy of your *real* SnapTrade holdings, priced with live quotes.
- **Live mode:** real orders through your own broker (`placeForceOrder`), only after you click approve, and capped.

## Use it inside Claude (MCP)

```bash
npm run mcp     # stdio MCP server; shares .env.local and .data/ with the web app
```

Claude Desktop → Settings → Developer → Edit config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "atlas": {
      "command": "npx",
      "args": ["-y", "tsx", "C:/dev/atlas/src/mcp/server.mts"]
    }
  }
}
```

Claude Code: `claude mcp add atlas -- npx -y tsx C:/dev/atlas/src/mcp/server.mts`

| Tool | What it does |
|---|---|
| `atlas_what_if` | What-if deep agent over your real holdings; also posts the graph card in the Atlas app |
| `atlas_research_company` | Deep research: 4 analyst agents, a debate round and a judge. Verdict, 0-100 confidence score, cited reports per angle |
| `atlas_review_portfolio` | Deep research on the 3 biggest holdings, one card per stock |
| `atlas_scan` | Rule checks plus a public-sources scan |
| `atlas_get_portfolio` | Holdings from SnapTrade, current mode and live limits |
| `atlas_propose_trade` | Creates a decision card in Atlas. **Doesn't trade**; the human approves in the app, and live amounts are capped at $25/$100 |
| `atlas_pending_decisions` | What the user approved or declined |
| `atlas_rules` | List, add or remove watch rules |
| `atlas_daily_run` | Runs the daily run now: brief plus paper suggestions |
| `atlas_daily_schedule` | Shows or changes the daily schedule (on/off, time, stocks per run) |

**Chat lives in Claude, not in the web app.** The web app has no free-form chat box, because every message there would cost API credits. Talk to Atlas from the Claude app instead (your Claude plan covers the conversation); only the research tools spend API credits.

Cards that Claude creates show "From Claude (via Atlas MCP)" in the app. Keep `npm run dev` running so you can approve them.

## Chrome extension (one-click Claude Deep Research)

Without it, *Deep research in Claude* opens claude.ai with the prompt filled in, and you turn on Research, send, and paste the answer back. With the extension in `extension/`, one click opens a Claude tab with Research mode on and the prompt filled in. You press send; the extension then waits for the `ATLAS_RESULT` block and posts the card to Atlas. Progress shows in Atlas above the composer. It only acts in the tab it opened, and only when Atlas (localhost) asks.

Install: `chrome://extensions` → Developer mode → Load unpacked → select the `extension` folder → reload the Atlas tab. Details, security and troubleshooting: [extension/README.md](extension/README.md).

**Why not just use Claude with SnapTrade's connector?** A limit you type into a chat ("never spend more than $25") is a request the model can misread or be talked out of. In Atlas, the AI has no tool that executes trades, and the caps are code (`src/lib/trading.ts`, `src/app/api/action/route.ts`). Atlas also brings what a chat doesn't have: what-if mapping onto your actual holdings, saved rules, scanning without being asked, and a paper copy of your real account.

## Default guardrails (and why)

The author asked for these to be picked with the reasoning written down. All of them can be changed by asking Claude ("tell me if anything drops 5%"), which uses the `atlas_rules` tool.

| Guardrail | Default | Why |
|---|---|---|
| Concentration | Flag if one stock is over **25%** of the portfolio | If one company is a quarter of everything you own, one bad day for that company hurts the whole portfolio. |
| Drawdown | Flag if a stock is **10%** below what you paid | Big enough to ignore daily noise, small enough to catch real moves. Atlas suggests *researching why* first. A drop alone is not a reason to sell. |
| Idle cash | Mention if over **10%** is cash | Only a thought, not a decision. Cash is fine; it's just good to know about. |
| Live trade cap | **$25 per trade, $100 per day** | A fixed dollar amount is easier to understand than a percentage, and it keeps any mistake small. Enforced on the server (`src/lib/trading.ts`). |
| Daily run | **Off until you turn it on; 9:00 AM; 1 stock researched per run** | Each stock researched costs about $0.40 of API credit, so the default is one a day, in rotation: holdings never researched first (biggest first), then the one researched longest ago. It runs only while Atlas is running on your computer, and catches up if you start Atlas after the set time. |
| Daily suggestions | **Paper only, sized at 2% of the portfolio ($25 to $500)** | A suggestion is something to try, not an order. 2% is big enough to see what the change does to the portfolio and small enough that one idea never dominates it. Buy or sell follows the research verdict; hold verdicts produce no suggestion. |
| Spreading risk | **Suggest a broad index fund (VOO) when one stock is over the limit or cash sits idle** | An index fund holds hundreds of companies at once, so it lowers the risk of one company hurting everything, instead of adding to a single stock. |
| Order type | **Market order, good for the day, sized in dollars** | The simplest order there is: "buy $25 of X now". If a broker doesn't accept dollar amounts, Atlas falls back to whole shares that still fit under the cap. |
| Broker for the demo | **SnapTrade Sandbox** (or Alpaca Paper) | Free and instant, with no real account needed. Orders go through the real SnapTrade trading API, but the money is pretend. A real-money Questrade or Wealthsimple account works the same way. |

Rule checks are plain arithmetic in code (`src/lib/rules.ts`). The model only makes fuzzy judgement calls: is this headline relevant, is it about a strike, a regulation or earnings, and is it good or bad for the company.

## 90-second demo script

0. **What-if** (the hook): switch the composer to *What if…?* and run "What if Taiwan blocks chip exports?". Show the agent trace, the impact range on your real holdings, and the graph. Then do the same from Claude Desktop with `atlas_what_if`, and show the card arriving in Atlas with the "From Claude" badge.
1. **Connect:** the brokerage is linked through SnapTrade (the dashboard's SnapTrade Sandbox, or the Connect button → Alpaca Paper). Atlas now shows your real holdings, with the source label "Live data from … via SnapTrade".
2. **Daily run:** in the sidebar, turn on *Daily run* and press *Run now*. The daily brief appears (what changed, what the rules flagged, the verdict), followed by suggestion cards. Click *Try it in paper* on one: a "Simulated" receipt appears and the paper portfolio changes.
3. **Review my portfolio:** Atlas researches your biggest holdings. Open a card: each analyst's cited report, who pushed back in the debate, the judge's verdict and the confidence score.
4. **Scan now:** Atlas checks the rules and reads filings, news and Federal Register notices. A *thought* appears (no action needed), and a *decision card* appears with a recommendation and real options.
5. **One-click Claude Deep Research** (with the Chrome extension): click *Go deeper in Claude* on a research card. A Claude tab opens with Research mode on and the prompt filled in; press send. If Claude's SnapTrade connector is set up, it reads your holdings itself. Progress shows in Atlas; about 10 minutes later the Claude card arrives on its own.
6. **Chat in Claude:** "I'm interested in EVs and semiconductors. Warn me if anything I own drops 8%." Claude saves the interests and the rule through Atlas's MCP tools.
7. **Approve** a $25 trade in paper mode: a "Simulated trade" receipt appears. Switch to **live mode** (type LIVE) and ask Claude to "buy $500 of NVDA". The card arrives reduced to $25, and nothing executes until you click.

## Code map

- `src/lib/snaptrade.ts`: SnapTrade client (connect, holdings, quotes, orders)
- `src/lib/portfolio.ts`: real, paper and demo portfolios
- `src/lib/rules.ts`: deterministic rule checks
- `src/lib/trading.ts`: approved-trade execution and live caps
- `src/lib/sources.ts`: SEC EDGAR, Google News RSS, Federal Register
- `src/lib/scan.ts`: headline triage, then Opus writes the thought and decision cards
- `src/lib/research.ts`: deep research (4 analyst agents → debate round → judge with a 0-100 confidence score)
- `src/lib/review.ts`: portfolio review of the biggest holdings, and the buy/sell buttons under research cards
- `src/lib/daily.ts`: the daily run (watch list, what changed, rule flags, research in rotation, paper suggestions, brief)
- `src/lib/scheduler.ts`, `src/instrumentation.ts`: the timer that starts the daily run when it is due
- `src/lib/scenario.ts`: what-if deep agent (planner → parallel researchers → synthesizer; dollar math in code)
- `src/lib/proposals.ts`: AI trade suggestion → decision card (used by the MCP server)
- `src/mcp/server.mts`: Atlas MCP server for Claude
- `src/app/api/action/route.ts`: the only code path that executes a trade, after a user click
