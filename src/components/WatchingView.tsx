"use client";

import { Button, PageIntro } from "./ui";
import FreshnessCard from "./FreshnessCard";
import MorningCheck from "./MorningCheck";
import RulesSection, { isPortfolioRule } from "./RulesSection";
import TopicsSection from "./TopicsSection";
import type { ViewProps } from "./viewProps";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function WatchingView(props: ViewProps) {
  const { state, actions, jobs } = props.atlas;
  const rules = state.rules.filter(isPortfolioRule).length;
  const topics = state.interests.length + state.rules.filter((r) => !isPortfolioRule(r) && r.topic).length;
  const checking = jobs.running.some((j) => j.kind === "scan");

  return (
    <>
      <PageIntro
        what="What Atlas keeps an eye on for you, and when it looks."
        now={`${count(rules, "rule")}, ${count(topics, "topic")}, morning check ${state.daily?.enabled ? "on" : "off"}`}
        actions={
          <Button onClick={actions.scan} disabled={checking}>
            {checking ? "Checking…" : "Check now"}
          </Button>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:col-span-2">
          <RulesSection atlas={props.atlas} />
          <MorningCheck atlas={props.atlas} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-5">
          <TopicsSection atlas={props.atlas} />
          <FreshnessCard atlas={props.atlas} />
        </div>
      </div>
    </>
  );
}
