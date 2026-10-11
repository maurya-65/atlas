# Atlas

An AI investing agent for a brokerage account connected through [SnapTrade](https://snaptrade.com). Atlas reads what you hold, reads public sources about it, and explains in plain words what matters. It can research a company, suggest ideas, trace a what-if through your holdings, and propose a trade.

**It never trades on its own.** A trade only happens when you click a decision card, and real-money orders are capped in server code.

Built for SnapTrade Hack Atlantic 2026 (Student Challenge).

## Features

- **Ideas.** Say what you want in plain words. Atlas asks a few short questions, then suggests up to five US stocks or funds, each with a reason, its main risk and how it fits what you hold. Every candidate is checked against market data first, and every number shown comes from that data. Ideas are tried as paper trades and followed on the page.
- **Research.** Nine analysts each take one angle on a company, argue once, and a judge gives a verdict with a 0-100 confidence score.
- **What-if.** "What if Taiwan blocks chip exports?" Atlas maps the event onto your holdings with a rough dollar range. The dollar math is done in code.
- **Watching.** Rules in plain words (too much in one stock, a stock well below what you paid, idle cash, price alerts), topics to follow, and a morning check that leaves a short note each day.
- **Decisions.** Every suggestion waits for your yes or no.
- **Chat.** Questions about your portfolio or an investing term.
- **Paper and real money.** Paper mode (the default) trades a simulated copy of your account. Real-money mode sends market orders through SnapTrade.
- **Guide.** A user manual inside the app.

## Getting started

You need Node.js 20.9 or newer, an [Anthropic API key](https://console.anthropic.com) and SnapTrade keys (a free sandbox works and trades pretend money).

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000
```

Without SnapTrade keys the app still starts and shows a labelled demo portfolio. State is one JSON document in `.data/store.json`.

## Configuration

| Variable | What it's for |
|---|---|
| `ATLAS_ANTHROPIC_API_KEY` | Claude API key. |
| `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` | SnapTrade dashboard → API keys. |
| `ATLAS_PASSWORD` | Puts the app behind a sign-in. Required when hosted. |
| `ATLAS_USERNAME` | Optional: sign-in asks for this username too. |
| `ATLAS_SHOW_LOGIN` | `1` shows the username and password under the sign-in form, for a demo copy shared with reviewers. |
| `CRON_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Hosted only. See [Deploying to Vercel](#deploying-to-vercel). |

Optional: `SNAPTRADE_AUTH_MODE` (`personal` by default, `commercial` for app keys), `SNAPTRADE_BROKER` (open the connection portal on one broker), `SEC_USER_AGENT` (the contact string SEC EDGAR asks for) and `ATLAS_APP_URL` (the address the MCP server tells Claude).

## Safety model

Atlas is built so that a wrong answer from the model costs a bad suggestion, not money.

- The model has no order-placing tool. Only a click on a decision card reaches `src/app/api/action/route.ts`, and a card can be decided once.
- Real-money orders are capped at $25 per trade and $100 per day in `src/lib/trading.ts`, whatever the card says.
- A broker that only takes whole shares gets whole shares, so under the cap only a share that costs $25 or less can be bought there. Atlas says so instead of sending a bigger order.
- Switching to real money requires typing `LIVE`. A hosted copy stays in paper mode.
- Ideas and morning-check suggestions are always paper trades.
- Writes are accepted only from the Atlas page or its Chrome extension (`src/proxy.ts`).
- A hosted copy refuses to serve anything until `ATLAS_PASSWORD` is set.

**Default guardrails** for a new store: flag a single stock above 25% of the portfolio, flag a stock 10% below its purchase price, mention cash above 10%. Change them on the *Watching* page.

SnapTrade calls used: the connection portal, `listUserAccounts`, `getAllAccountPositions`, `getUserAccountBalance`, `getUserAccountRecentOrders`, `getUserAccountQuotes`, and `placeForceOrder` for real-money orders.

## Using Atlas with Claude

**MCP server.** Gives Claude the same tools as the app. Claude can propose a trade; it cannot place one.

```bash
npm run mcp
claude mcp add atlas -- npx -y tsx /path/to/atlas/src/mcp/server.mts
```

**Deep Research in Claude.** Atlas's research can also run in Claude's Research mode, on your Claude plan (Pro or higher). Click **Research in Claude**, press send in the tab that opens, and the finished report comes back into Atlas through the Chrome extension in `extension/`, or by pasting it under *Settings*. Setup steps are in *Settings → Claude* and in [extension/README.md](extension/README.md).

**Claude skill.** `claude-skill/atlas-stock-research/` is an optional skill that gives Claude the research method and report format. Download it from *Settings → Claude* and add it in Claude under Settings → Customize → Skills.

## Deploying to Vercel

1. Import the repository.
2. Add Upstash Redis from the Storage tab. Vercel has no writable disk, so the state lives in Redis there.
3. Set the variables from the table above.
4. Deploy. Later pushes to the production branch deploy by themselves.

`vercel.json` runs the morning check once a day at 13:00 UTC.

## Tests

```bash
npm test
npm run typecheck
npm run lint
```

The tests cover the parts where a mistake costs money or leaks access: trade execution and the caps, Ideas, decision cards, rules, sign-in and research citations. They need no keys and make no network calls.

## Project layout

```
src/app/            pages and API routes
src/components/     the UI, one view per page
src/lib/            everything the app does, one file per concern
src/mcp/server.mts  MCP server
src/proxy.ts        sign-in and write checks
extension/          Chrome extension for Research in Claude
claude-skill/       Claude skill for the same hand-off
tests/              node:test suites
```

## Limits

- **One user.** The whole state is a single JSON document (a file, or one Redis key). There are no accounts, only the optional sign-in.
- **Real-money orders are lightly tested.** The SnapTrade sandbox accepted a whole-share order built by Atlas, but it has no share under the $25 cap, so a full capped order from a decision card has not been run against a broker.
- **The extension depends on claude.ai's page.** If claude.ai changes its markup, the selectors in `extension/claude.js` need updating; pasting the report under *Settings* always works.
- **Not financial advice.** Atlas produces research and suggestions. You make the decisions.
