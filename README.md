# Atlas

Atlas watches a brokerage account through SnapTrade, reads public sources about what you hold (SEC filings, news, Federal Register notices), and tells you in plain words when something matters. It never trades on its own: a trade only happens when you click a decision card.

Built for SnapTrade Hack Atlantic 2026 (Student Challenge).

## What it does

The app has two places for results. **Chat** is where you ask for things: each conversation is a thread, newest message at the bottom. The **Inbox** is where Atlas puts what it finds on its own: scan results, rule alerts, daily briefs and trades waiting for your yes or no.

- **Research.** Four analysts each take one angle on a stock (business, regulation, industry, operations). They start from the sources Atlas collects, search the web, and write a short cited report. They read each other's reports and argue once, then a judge gives a verdict (buy more, sell some, hold) with a 0-100 confidence score. *Review my portfolio* does this for the three biggest holdings.
- **What-if.** "What if Taiwan blocks chip exports?" A planner splits the scenario into the ways it could spread, researchers read the news for each, and a synthesizer maps it onto your holdings with a rough dollar range. The dollar math is done in code.
- **Scan and rules.** Rule checks (concentration, drawdown, idle cash, price levels) are plain arithmetic, and rules can be added on the Rules & topics page, which also shows what each one finds right now. *Check now* in the Inbox runs the rules and reads new filings and headlines, then posts a note or a decision card.
- **Daily run.** Once a day: what changed, what the rules flagged, research on the next holding in rotation, and suggestions you can try as paper trades.
- **Ask.** Questions about the portfolio or an investing term, answered in the chat thread you are in. Atlas keeps a one-line note of each answer so later answers have context.
- **Claude.** An MCP server gives Claude the same tools. Claude can propose a trade; it cannot place one.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000
```

| Variable | What it's for |
|---|---|
| `ATLAS_ANTHROPIC_API_KEY` | Claude. Wins over an `ANTHROPIC_API_KEY` already set in the shell. |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | SnapTrade dashboard → API keys. Without them the app shows a labelled demo portfolio. |
| `SNAPTRADE_AUTH_MODE` | `personal` (default) for dashboard keys, where brokerages are linked in the dashboard or with the Connect button. `commercial` for app keys, where Atlas registers a SnapTrade user itself. |
| `SNAPTRADE_BROKER` | Optional. Opens the connection portal on one broker, e.g. `ALPACA-PAPER`. |
| `SEC_USER_AGENT` | Optional contact string, which SEC EDGAR asks for. |
| `ATLAS_PASSWORD` | Puts the app behind a sign-in. Optional locally, required when hosted. |

State is one JSON document in `.data/store.json`. *Start over* (under Settings) clears it and keeps the brokerage link.

Research runs on Claude Opus 5.5 and costs about $1.50 per stock, most of it the web pages the analysts read. Questions in Chat use Claude Sonnet 5.5 at medium effort, about half a cent each (`CHAT_MODEL` in `src/lib/llm.ts`).

## SnapTrade

- **Connect:** the hosted connection portal (`loginSnapTradeUser`, `connectionType: "trade"`).
- **Read:** `listUserAccounts`, `getAllAccountPositions`, `getUserAccountBalance`, `getUserAccountRecentOrders`, and quotes from `getUserAccountQuotes`.
- **Paper mode** (default): a simulated copy of the connected account, priced with live quotes. Trades change the copy only.
- **Live mode:** market orders through `placeForceOrder`, sized in dollars.

The demo uses the SnapTrade Sandbox, which trades with fake money.

## Trading safeguards

- The model has no tool that places an order. `src/app/api/action/route.ts` is the only path that trades, and it runs when a user clicks a card. A card can be decided once, so a double click does not trade twice.
- Live orders are capped at $25 per trade and $100 per day in `src/lib/trading.ts`, whatever the card says.
- Switching to live mode requires typing `LIVE` and a connected account. A hosted copy stays in paper mode.
- Daily-run suggestions are always paper trades.
- Writes are accepted only from the Atlas page or its extension, as JSON (`src/proxy.ts`).

Defaults for a new store: flag a single stock above 25% of the portfolio (funds are not counted), flag a stock 10% below its purchase price, mention cash above 10%. The daily run is off until turned on.

## Claude (MCP)

```bash
npm run mcp     # stdio server; shares .env.local and .data/ with the web app
```

Claude Code: `claude mcp add atlas -- npx -y tsx /path/to/atlas/src/mcp/server.mts`

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "atlas": { "command": "npx", "args": ["-y", "tsx", "/path/to/atlas/src/mcp/server.mts"] }
  }
}
```

| Tool | What it does |
|---|---|
| `atlas_get_portfolio` | Holdings, mode and live limits |
| `atlas_research_company` | Research on one stock |
| `atlas_review_portfolio` | Research on the three biggest holdings |
| `atlas_what_if` | What-if on the current holdings |
| `atlas_scan` | Rule checks and a public-sources scan |
| `atlas_propose_trade` | Creates a decision card. It does not trade. |
| `atlas_pending_decisions` | What the user approved or declined |
| `atlas_rules` | List, add or remove rules |
| `atlas_daily_run`, `atlas_daily_schedule` | Run the daily check, or change its schedule |
| `atlas_memory` | Read or add to the notes Atlas keeps between conversations |

Cards Claude creates are marked "From Claude" in the app.

## Chrome extension

*Deep research in Claude* opens claude.ai with a prompt filled in; you paste the answer back under Settings and Atlas turns it into a card without an API call. The extension in `extension/` skips the copy and paste. See [extension/README.md](extension/README.md).

## Deploy to Vercel

1. Import the repository.
2. Add Upstash Redis from the Storage tab. Vercel has no writable disk, so the state lives in Redis there (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).
3. Set the variables from the table above, plus `ATLAS_PASSWORD` and `CRON_SECRET` (a long random string).
4. Deploy.

A hosted copy refuses to serve anything until `ATLAS_PASSWORD` is set, and it never places real orders.

`vercel.json` calls `/api/cron/daily` once a day at 13:00 UTC, so on Vercel the daily run starts then rather than at the time picked in the app. Requests are limited to 300 seconds; one stock takes about a minute and a half, so keep the daily run at one or two stocks.

## Tests

```bash
npm test
```

The tests cover the parts where a mistake costs money or leaks access: trade execution and the live caps, decision cards, rule checks and adding rules, sign-in and the write checks, research citations, and which chat an answer belongs to. They need no keys and make no network calls; the model is replaced by a stand-in. They do not cover a real order reaching a broker, reading a real SnapTrade account, or the browser.

## Code map

- `src/lib/snaptrade.ts`: SnapTrade client
- `src/lib/portfolio.ts`: real, paper and demo portfolios
- `src/lib/trading.ts`: executing an approved trade, live caps
- `src/lib/rules.ts`: rule checks
- `src/lib/sources.ts`: SEC EDGAR, Google News RSS, Federal Register
- `src/lib/research.ts`: analysts, debate, judge
- `src/lib/scenario.ts`: what-if
- `src/lib/scan.ts`: headline triage and cards
- `src/lib/daily.ts`, `src/lib/scheduler.ts`, `src/app/api/cron/daily/route.ts`: the daily run and its two timers
- `src/lib/chat.ts`, `src/lib/threads.ts`: answering in a chat, the chat list, memory
- `src/lib/handoff.ts`: Claude Deep Research prompt and import
- `src/lib/store.ts`: state, as a file or one Redis key
- `src/proxy.ts`, `src/lib/auth.ts`: sign-in and write checks
- `src/mcp/server.mts`: MCP server
