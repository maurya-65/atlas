"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Details, PageIntro } from "./ui";

// The user manual: what each page is for, how to use it, and what to do when something doesn’t work.
// Plain words first; the exact rules sit behind "Show details" for anyone who wants them.

const LINK = "font-medium text-foreground underline decoration-white/30 underline-offset-2 hover:decoration-white/70";

function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={`#${to}`} className={LINK}>
      {children}
    </a>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <Card id={`guide-${id}`} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">{children}</CardContent>
    </Card>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

function Points({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

const CONTENTS = [
  ["start", "Start here"],
  ["first", "Your first ten minutes"],
  ["home", "Home"],
  ["portfolio", "Portfolio"],
  ["ideas", "Ideas"],
  ["research", "Research"],
  ["chat", "Chat"],
  ["decisions", "Decisions"],
  ["watching", "Watching"],
  ["history", "History"],
  ["settings", "Settings"],
  ["money", "Paper and real money"],
  ["claude", "Research in Claude"],
  ["words", "Words you will see"],
  ["help", "When something doesn’t work"],
] as const;

export default function GuideView() {
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageIntro
        what="Everything you need to use Atlas on your own: what each page is for, how to use it, and what to do when something doesn’t work. Read it top to bottom once, or jump to a part."
        now="About ten minutes to read."
      />

      <nav aria-label="Guide contents" className="flex flex-wrap gap-1.5">
        {CONTENTS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => jump(id)}
            className="h-7 shrink-0 rounded-full border border-white/10 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            {label}
          </button>
        ))}
      </nav>

      <Section id="start" title="Start here" intro="What Atlas is, in one minute.">
        <p>
          Atlas looks after your investments with you. It reads your brokerage account, explains what you own in everyday words, researches companies, suggests ideas, and keeps an eye on
          things while you are away. <strong>It never buys or sells anything by itself.</strong> Every trade waits for you to click yes.
        </p>
        <p>
          Atlas starts in <strong>paper mode</strong>: trades are pretend, made with a copy of your account, so you can try anything without risking a cent. The small tag at the top
          right of every page says <strong>Paper</strong> while this is on.
        </p>
        <p>
          The menu on the left is in the order you would use it: see your money (Home, Portfolio), understand it (Ideas, Research, Chat), decide and keep watch (Decisions,
          Watching), and look back (History). On a phone, tap the menu button at the top left to open it.
        </p>
      </Section>

      <Section id="first" title="Your first ten minutes" intro="A short path that shows you most of Atlas.">
        <Steps>
          <li>
            Open <Go to="portfolio">Portfolio</Go> and look at what you own: the biggest holdings come first, with how much each is worth and how it has done since you bought it.
          </li>
          <li>
            Go to <Go to="ideas">Ideas</Go> and type what you want in your own words, for example “I have $2,000 for a few years and want something steady”. Answer the few
            questions Atlas asks by tapping an answer.
          </li>
          <li>Pick one of the ideas, press the button to try it, look at the preview of what your portfolio would look like, and confirm. It is a paper trade, so nothing real happens.</li>
          <li>
            Open <Go to="portfolio/paper">Portfolio → Paper account</Go> to see that pretend trade, and come back later to see whether it gained or lost.
          </li>
          <li>
            On <Go to="research">Research</Go>, open a company you own to read what Atlas found, or start a new research on any company.
          </li>
          <li>
            On <Go to="watching">Watching</Go>, turn on the morning check so Atlas writes you a short note about your portfolio every day.
          </li>
        </Steps>
      </Section>

      <Section id="home" title="Home" intro="The page you land on: what needs you, what changed, and what Atlas is doing.">
        <Points>
          <li>
            <strong>Getting started</strong> lists the setup steps that are still open. Hide it once you are done.
          </li>
          <li>
            <strong>Needs you</strong> shows decisions waiting for your yes or no.
          </li>
          <li>
            <strong>Morning check</strong> shows the latest daily note. <strong>Check now</strong> writes a fresh one straight away.
          </li>
          <li>
            <strong>Running now</strong> and <strong>Last things Atlas did</strong> show work in progress and what just finished.
          </li>
        </Points>
      </Section>

      <Section id="portfolio" title="Portfolio" intro="What you own and how it is doing. Four tabs.">
        <Points>
          <li>
            <strong>Holdings</strong>: everything in your account, biggest first, with its value, its share of your money, and the change since you bought it. Companies have a
            Research button. Funds and crypto don’t, because Atlas’s research reads company reports, which they don’t have.
          </li>
          <li>
            <strong>Performance</strong>: what the suggestions you approved have done since, trade by trade.
          </li>
          <li>
            <strong>Paper account</strong>: your pretend trades, what each cost, what it is worth now and the gain or loss. You can start the paper account over from here.
          </li>
          <li>
            <strong>Orders</strong>: orders your brokerage has on record.
          </li>
        </Points>
      </Section>

      <Section id="ideas" title="Ideas" intro="Tell Atlas what you want from your money; it suggests checked ideas you can try on paper.">
        <Steps>
          <li>Type what you are after in plain words: how much, for how long, what you like or want to avoid. No special words needed.</li>
          <li>
            Atlas asks up to four short questions. Tap an answer, write your own, or tap <strong>You decide</strong>. Your answers change the ideas a lot: someone who would sell
            after a drop gets calmer ideas than someone who can wait it out.
          </li>
          <li>
            You get up to five ideas. Each says what it is, why it suits you, the main risk, what would show the idea was wrong, how it fits next to what you own, and a suggested
            amount. Atlas may also suggest fewer, or none, when nothing is convincing.
          </li>
          <li>
            Press the button on an idea to see a preview: how your portfolio would look after, and whether anything breaks your limits. Confirm to make the paper trade.
          </li>
          <li>Ideas you tried stay listed on this page with how much they have gained or lost since.</li>
        </Steps>
        <Details label="how ideas are checked">
          <p>
            Every suggested company or fund is looked up in real market data before you see it. Anything that can’t be found, isn’t listed in the US, trades too little, is very
            cheap per share or multiplies market swings is set aside, and the live progress shows why. All prices and percentages on the page come from that data, never from
            Atlas’s own writing.
          </p>
          <p>
            Amounts are shared out from the sum you gave, then cut so that one company stays under five percent of your portfolio and one fund under fifteen, or under your own
            concentration rule if it is lower. Ideas are always paper trades, even in real-money mode.
          </p>
        </Details>
      </Section>

      <Section id="research" title="Research" intro="Everything Atlas knows about a company, and where new research starts.">
        <Points>
          <li>
            <strong>Companies</strong>: every company Atlas has looked at. Open one to see its latest verdict, how the verdict changed over time, and what you decided.
          </li>
          <li>
            <strong>New research</strong>: type a company’s ticker (its short market code, like MSFT for Microsoft) and press Research. A team of nine reviewers each looks at one
            side of the company (the business, its money, risks, news and more), they argue it out, and a final judge gives a verdict with a confidence score from 0 to 100. It
            takes one to two minutes. You can leave the page; the result is kept on the company’s page and a message tells you when it is ready.
          </li>
          <li>
            <strong>Research my top 3</strong> researches your three biggest company holdings one after another.
          </li>
          <li>
            <strong>Research a sector</strong> looks at an industry, like semiconductors, and what it means for what you own.
          </li>
          <li>
            <strong>Watchlist</strong>: companies you want to follow without owning them.
          </li>
          <li>
            <strong>What-ifs</strong>: describe an event (“What if oil prices double?”) and Atlas traces how it could reach each thing you own, with a rough dollar range. Results
            are kept under What-ifs.
          </li>
        </Points>
        <p>
          A verdict is one of: <strong>consider buying</strong>, <strong>consider selling</strong>, <strong>keep watching</strong>, or <strong>not enough information</strong>. It is
          a well-argued opinion, not a promise. Read the reasons and the risks before acting on it.
        </p>
      </Section>

      <Section id="chat" title="Chat" intro="Ask anything about your portfolio or an investing word you don’t know.">
        <p>
          Type a question like “Why is so much of my money in one place?” or “What is a dividend?”. Each conversation is kept in a list so you can come back to it. When a question
          needs a full research or a what-if, the answer offers a button for it; nothing long starts unless you press it.
        </p>
      </Section>

      <Section id="decisions" title="Decisions" intro="Everything waiting for your yes or no, and what you decided before.">
        <p>
          Suggestions from research, the morning check and alerts arrive here as cards. Each card shows its options, with the one Atlas recommends marked. Choose one, or{" "}
          <strong>Not now</strong> to set it aside. A card can only be decided once, so a double click never trades twice. Below the open cards is a record of past decisions and
          what came of them.
        </p>
      </Section>

      <Section id="watching" title="Watching" intro="What Atlas keeps an eye on for you, and when it checks.">
        <Points>
          <li>
            <strong>Rules</strong>: simple alarms in plain words, for example “tell me if one stock grows past 25% of my money”, “tell me if a stock falls 15% below what I paid”,
            “tell me if more than 30% sits in cash”, or a price alert for one company. Each rule shows whether it is fine right now or has been set off.
          </li>
          <li>
            <strong>Topics you follow</strong>: subjects or companies Atlas should watch the news for.
          </li>
          <li>
            <strong>Morning check</strong>: once a day Atlas looks at your portfolio, your rules and your topics, and leaves a short note on Home. It can also research a few of
            your holdings each time. It is off until you turn it on. Any trade it suggests is a paper trade.
          </li>
        </Points>
      </Section>

      <Section id="history" title="History" intro="Everything Atlas has done, newest first.">
        <p>
          Research, ideas, decisions, morning notes, trades and alerts, in one list. Use the buttons at the top to show only one kind. Chat conversations stay in Chat.
        </p>
      </Section>

      <Section id="settings" title="Settings" intro="Your brokerage, paper or real money, safety limits, Claude and memory.">
        <Points>
          <li>
            <strong>Brokerage</strong>: connect your brokerage account through SnapTrade, a secure connection service. Atlas only sees what the connection allows, and you can pick
            which account to use.
          </li>
          <li>
            <strong>Paper or real money</strong>: switch between pretend and real trades. See the next part before you do.
          </li>
          <li>
            <strong>What Atlas can never do</strong>: the built-in limits, which no setting or message can switch off.
          </li>
          <li>
            <strong>Research in Claude</strong>: set up the longer research route described below, and paste in a finished report.
          </li>
          <li>
            <strong>What Atlas remembers</strong>: one-line notes from your chats (and from Claude, if you connected it), so later answers have context. You can read and delete them. <strong>Start over</strong> clears Atlas’s
            records here.
          </li>
        </Points>
      </Section>

      <Section id="money" title="Paper and real money" intro="Try everything on paper first. Real money has hard limits.">
        <Points>
          <li>
            <strong>Paper mode</strong> (the default) uses a copy of your account with live prices. Trades are simulated and nothing reaches your brokerage.
          </li>
          <li>
            <strong>Real-money mode</strong> sends approved trades to your brokerage. You have to type LIVE to switch it on. Each trade is capped at $25 and each day at $100,
            whatever a card says.
          </li>
          <li>Even in real-money mode, ideas and morning-check suggestions stay paper trades.</li>
          <li>A copy of Atlas reached over the internet always stays in paper mode; real-money mode only works when Atlas runs on your own computer.</li>
        </Points>
      </Section>

      <Section id="claude" title="Research in Claude" intro="A longer, deeper research done in Claude, brought back into Atlas.">
        <p>
          Next to Research you will often see <strong>Research in Claude</strong>. It opens Claude with a full research request already written for that company. Claude’s Research
          mode reads many more sources and takes around ten minutes. It needs a paid Claude plan (Pro or higher).
        </p>
        <Steps>
          <li>Press Research in Claude. Claude opens in a new tab with the request filled in.</li>
          <li>Make sure Research is turned on in Claude, then press send.</li>
          <li>
            When Claude finishes, its answer ends with a block marked ATLAS_RESULT. With the Atlas Chrome extension installed, the report comes back into Atlas by itself. Without
            it, copy Claude’s whole answer and paste it under <Go to="settings/claude">Settings → Research in Claude</Go>.
          </li>
          <li>The report appears on the company’s page next to Atlas’s own research.</li>
        </Steps>
        <p>
          Optional: download the <strong>Atlas research skill</strong> from Settings and add it in Claude under Settings → Customize → Skills (code execution must be on). It gives
          Claude the exact method and report layout. Research works without it.
        </p>
      </Section>

      <Section id="words" title="Words you will see" intro="Short meanings, in the order you are likely to meet them.">
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["Ticker", "A company’s or fund’s short market code, like AAPL for Apple."],
            ["Holding", "Something you own in your account."],
            ["Share of portfolio", "How much of all your money sits in one holding."],
            ["Fund", "One purchase that owns many companies at once, like an S&P 500 fund."],
            ["Dividend", "Cash a company pays its owners, usually every few months."],
            ["Paper trade", "A pretend trade, to see what would happen without real money."],
            ["Verdict", "Atlas’s conclusion on a company after research."],
            ["Confidence", "How sure the verdict is, from 0 to 100."],
            ["Ups and downs", "How much a price usually swings: calm, moderate or bumpy."],
            ["Worst fall", "The biggest drop from a high in the past year."],
            ["What-if", "A made-up event, traced through to what you own."],
            ["Concentration", "Too much money in one place, so one bad day hurts a lot."],
          ].map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-medium text-foreground">{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="help" title="When something doesn’t work" intro="The usual causes, and what to do.">
        <Points>
          <li>
            <strong>A red “That didn’t work” line at the top</strong>: it says what went wrong. Most of the time, trying again a minute later works.
          </li>
          <li>
            <strong>Not sure where a result went</strong>: every task says where its result will be when it starts, and the <strong>Activity</strong> button at the top right lists
            what is running and links to each result.
          </li>
          <li>
            <strong>No Research button next to a holding</strong>: funds and crypto can’t be researched as companies. Use a what-if or Ideas for them instead.
          </li>
          <li>
            <strong>A ticker isn’t accepted</strong>: check the code on any finance site. Share classes use a dot, like BRK.B.
          </li>
          <li>
            <strong>Market data or the research didn’t load</strong>: a data source was busy. Wait a minute and try again.
          </li>
          <li>
            <strong>Claude’s report won’t paste in</strong>: copy Claude’s whole final answer, including the ATLAS_RESULT block at the end, not the request you sent.
          </li>
          <li>
            <strong>The holdings look like an example</strong>: no brokerage is connected yet. Connect one under <Go to="settings/brokerage">Settings → Brokerage</Go>.
          </li>
        </Points>
      </Section>
    </div>
  );
}
