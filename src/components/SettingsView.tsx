"use client";

import { useEffect } from "react";
import BrokerageSection from "./BrokerageSection";
import ClaudeSection from "./ClaudeSection";
import { MemoryCard, ResetCard } from "./DataSection";
import SafetyCard from "./SafetyCard";
import { PageIntro } from "./ui";
import type { ViewProps } from "./viewProps";
import { settingsSection, SETTINGS_SECTIONS, type SettingsSection } from "./views";

const LABELS: Record<SettingsSection, string> = {
  brokerage: "Brokerage and mode",
  safety: "Safety",
  claude: "Claude",
  memory: "Memory",
  reset: "Start over",
};

export default function SettingsView({ atlas, route }: ViewProps) {
  const { state } = atlas;
  const section = settingsSection(route);

  // A link like #settings/claude scrolls that section into view once the page has drawn it.
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [section]);

  return (
    <>
      <PageIntro
        what="Where your brokerage, money mode, safety limits, Claude and what Atlas remembers are set."
        now={
          state.mode === "live"
            ? "Live mode: trades you approve use real money."
            : `Paper mode: trades are practice only.${state.connected ? "" : " No brokerage is connected yet."}`
        }
        actions={
          <nav aria-label="Settings sections" className="flex flex-wrap gap-1.5">
            {SETTINGS_SECTIONS.map((s) => (
              <a
                key={s}
                href={`#settings/${s}`}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                {LABELS[s]}
              </a>
            ))}
          </nav>
        }
      />
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
        <BrokerageSection atlas={atlas} />
        <SafetyCard atlas={atlas} />
        <MemoryCard atlas={atlas} />
      </div>
      <ClaudeSection atlas={atlas} />
      <ResetCard atlas={atlas} />
    </>
  );
}
