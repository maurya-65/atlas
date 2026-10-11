"use client";

import GettingStarted from "./GettingStarted";
import { pendingDecisions } from "./derive";
import HomeSnapshot from "./HomeSnapshot";
import { NeedsYou, RecentActivity, RunningNow, SinceLastCheck } from "./HomeSections";
import { Button, buttonClass, PageIntro } from "./ui";
import type { ViewProps } from "./viewProps";

/** The landing page: what needs the user, what changed since the last check, and what Atlas is doing. */
export default function HomeView({ atlas }: ViewProps) {
  const { state, jobs, actions } = atlas;
  const waiting = pendingDecisions(state.messages).length;
  const running = jobs.running[0];
  const now = waiting
    ? `${waiting} ${waiting === 1 ? "decision is" : "decisions are"} waiting for you.`
    : running
      ? `${running.label} is running.`
      : "Nothing needs you right now.";

  return (
    <>
      <PageIntro
        what="Start here. Atlas shows what needs your answer, what changed since the last check, and what it is working on."
        now={now}
        actions={
          <>
            <Button onClick={actions.scan} disabled={jobs.running.some((j) => j.kind === "scan")}>
              Check now
            </Button>
            <a href="#research" className={buttonClass("outline")}>
              Research a company
            </a>
          </>
        }
      />
      <GettingStarted state={state} />
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:col-span-2">
          <NeedsYou atlas={atlas} />
          <SinceLastCheck atlas={atlas} />
          <HomeSnapshot state={state} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-5">
          <RunningNow atlas={atlas} />
          <RecentActivity atlas={atlas} />
        </div>
      </div>
    </>
  );
}
