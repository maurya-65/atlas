"use client";

import type { ReactNode } from "react";
import type { ChatMessage, DailyBrief } from "@/lib/types";
import { historyItems, pendingDecisions, sinceLastCheck, STANCE_LABEL } from "./derive";
import { clockTime, money, pct, plainText, timeAgo } from "./format";
import { MessageView } from "./Messages";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "./ui";
import type { Atlas } from "./useAtlas";
import { companyHref } from "./views";

const LINK = "font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white";
const MUTED = "text-sm text-muted-foreground";
const NEEDS_YOU_SHOWN = 3;
const RECENT_SHOWN = 3;

function Section({ title, link, children }: { title: string; link?: { href: string; text: string }; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {link && (
          <CardAction>
            <a href={link.href} className={`${LINK} text-sm`}>
              {link.text}
            </a>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

/** The newest decisions, answerable right here. */
export function NeedsYou({ atlas }: { atlas: Atlas }) {
  const pending = pendingDecisions(atlas.state.messages);
  const busy = atlas.choosing !== null;
  return (
    <Section title={pending.length ? `Needs you (${pending.length})` : "Needs you"} link={pending.length ? { href: "#decisions", text: pending.length > NEEDS_YOU_SHOWN ? `See all ${pending.length}` : "Open decisions" } : undefined}>
      {pending.length === 0 ? (
        <p className={MUTED}>Nothing needs you right now.</p>
      ) : (
        pending.slice(0, NEEDS_YOU_SHOWN).map((m) => <MessageView key={m.id} m={m} busy={busy} onChoose={(id, i) => atlas.actions.choose(id, i)} />)
      )}
    </Section>
  );
}

function changeSentence(b: DailyBrief): string {
  const p = b.portfolio;
  const value = money(p.total, 0);
  if (p.changeDollars === null) return `Your portfolio was ${value}. It was the first check, so there is nothing to compare with yet.`;
  if (Math.abs(p.changeDollars) < 0.5) return `Your portfolio was ${value}, the same as at the check before.`;
  const direction = p.changeDollars > 0 ? "up" : "down";
  const percent = p.changePct === null ? "" : ` (${pct(Math.abs(p.changePct))})`;
  return `Your portfolio was ${value}, ${direction} ${money(Math.abs(p.changeDollars), 0)}${percent} since the check before.`;
}

/** What the last morning check found, in a few lines. The whole brief is in History. */
export function SinceLastCheck({ atlas }: { atlas: Atlas }) {
  const { brief, flags, researched } = sinceLastCheck(atlas.state);
  const when = brief ? `Morning check ${timeAgo(brief.createdAt)}` : "Since the last check";

  if (!brief?.daily) {
    return (
      <Section title="Since the last check">
        {atlas.state.daily?.enabled ? (
          <p className={MUTED}>
            The morning check is on but hasn’t run yet. Its first brief will appear here. You can change the time under{" "}
            <a href="#watching" className={LINK}>
              Watching
            </a>
            .
          </p>
        ) : (
          <p className={MUTED}>
            No morning check has run yet. Turn it on under{" "}
            <a href="#watching" className={LINK}>
              Watching
            </a>{" "}
            and Atlas leaves a short brief here every day.
          </p>
        )}
        {flags.length > 0 && (
          <div>
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Your rules flag right now</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
              {flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    );
  }

  return (
    <Section title={when} link={{ href: "#history", text: "Read the full brief" }}>
      <p className="text-sm leading-relaxed">{changeSentence(brief.daily)}</p>
      {flags.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>Nothing is over your limits.</p>
      )}
      {researched.length > 0 && (
        <ul className="space-y-1 text-sm">
          {researched.map((r) => (
            <li key={r.ticker}>
              <a href={companyHref(r.ticker)} className={LINK}>
                {r.ticker}
              </a>
              <span className="text-muted-foreground">
                {r.stance ? ` · ${STANCE_LABEL[r.stance]}${r.score !== null ? `, ${r.score}/100` : ""}` : " · research didn’t finish"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RunningNow({ atlas }: { atlas: Atlas }) {
  const { running } = atlas.jobs;
  return (
    <Section title="Running now">
      {running.length === 0 ? (
        <p className={MUTED}>Nothing is running.</p>
      ) : (
        <ul className="space-y-2.5">
          {running.map((job) => (
            <li key={job.id} className="text-sm">
              <div className="font-medium">{job.label}</div>
              <p className="text-xs text-muted-foreground">{job.detail ?? "Working…"}</p>
              <a href={job.landing.href} className={`${LINK} text-xs`}>
                Will be in {job.landing.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function describe(m: ChatMessage): { kind: string; text: string; href: string } {
  switch (m.kind) {
    case "research":
      return { kind: "Research", text: m.research ? `${m.research.ticker}: ${STANCE_LABEL[m.research.stance]}` : plainText(m.text), href: m.research ? companyHref(m.research.ticker) : "#research" };
    case "scenario":
      return { kind: "What-if", text: m.scenario?.headline || m.scenario?.scenario || "What-if", href: "#research/scenarios" };
    case "ideas":
      return { kind: "Ideas", text: m.ideas?.summary || m.text, href: `#ideas/${m.id}` };
    case "constraint":
      return { kind: m.resolved ? "Decided" : "Decision", text: m.title || plainText(m.text), href: "#decisions" };
    case "daily":
      return { kind: "Morning check", text: m.daily?.summary ? plainText(m.daily.summary) : "Morning brief", href: "#history" };
    case "receipt":
      return { kind: m.mode === "live" ? "Real trade" : "Paper trade", text: m.title || plainText(m.text), href: "#history" };
    default:
      return { kind: "Note", text: m.title || plainText(m.text), href: "#history" };
  }
}

export function RecentActivity({ atlas }: { atlas: Atlas }) {
  const items = historyItems(atlas.state.messages).slice(0, RECENT_SHOWN);
  return (
    <Section title="Last things Atlas did" link={{ href: "#history", text: "All of History" }}>
      {items.length === 0 ? (
        <p className={MUTED}>Nothing yet. Press Check now and Atlas reads the news and filings about what you own.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((m) => {
            const row = describe(m);
            return (
              <li key={m.id}>
                <a href={row.href} className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm transition-colors hover:bg-white/[0.06]">
                  <span className="shrink-0 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{row.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{row.text}</span>
                  <time dateTime={m.createdAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {clockTime(m.createdAt)}
                  </time>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
