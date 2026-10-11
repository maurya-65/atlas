"use client";

import { api, money } from "./format";
import HoldingsTab from "./HoldingsTab";
import OrdersTab from "./OrdersTab";
import { usePaperData } from "./paperData";
import PaperTab from "./PaperTab";
import PerformanceTab from "./PerformanceTab";
import { PageIntro, cn } from "./ui";
import type { ViewProps } from "./viewProps";
import { PORTFOLIO_TABS, portfolioHref, portfolioTab, type PortfolioTab } from "./views";

const TAB_LABEL: Record<PortfolioTab, string> = {
  holdings: "Holdings",
  performance: "Performance",
  paper: "Paper account",
  orders: "Orders",
};

export default function PortfolioView({ atlas, route }: ViewProps) {
  const { state } = atlas;
  const tab = portfolioTab(route);
  const approvals = state.messages.filter((m) => m.kind === "receipt").length;
  const paper = usePaperData(approvals);
  const p = state.portfolio;

  const resetPaper = async () => {
    await api("/api/paper", { action: "reset" });
    await Promise.all([paper.reload(), atlas.refresh()]);
  };

  return (
    <>
      <PageIntro
        what="What you own, how it is doing, and your paper account, the practice copy where approved trades are simulated."
        now={p ? `${money(p.total)} in total, ${money(p.cash)} of it cash.${state.mode === "paper" ? " Showing your paper account." : ""}` : "Your brokerage is not connected yet."}
      />

      <nav aria-label="Portfolio sections" className="flex flex-wrap gap-1.5">
        {PORTFOLIO_TABS.map((t) => (
          <a
            key={t}
            href={portfolioHref(t)}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3.5 text-sm transition-colors",
              t === tab ? "border-white/10 bg-white/[0.09] font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {paper.error && tab !== "holdings" && <p className="text-sm text-live">Couldn’t load your paper account: {paper.error}</p>}
      {tab === "holdings" && <HoldingsTab atlas={atlas} />}
      {tab === "performance" && <PerformanceTab data={paper.data} />}
      {tab === "paper" && <PaperTab data={paper.data} mode={state.mode} onReset={resetPaper} />}
      {tab === "orders" && <OrdersTab data={paper.data} />}
    </>
  );
}
