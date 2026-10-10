"use client";

import type { Mode } from "@/lib/types";
import { PanelLeftIcon } from "./icons";
import { Button, cn } from "./ui";

interface Props {
  title: string;
  description: string;
  mode: Mode;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  /** Goes to Chat and puts the cursor in the message box */
  onAsk: () => void;
}

/** One-row glass header: sidebar toggle, where you are, the money mode as a quiet tag, and Ask Atlas. */
export default function TopBar({ title, description, mode, onToggleSidebar, sidebarOpen, onAsk }: Props) {
  const live = mode === "live";
  return (
    <header className="shrink-0 px-3 pt-3 sm:px-5">
      <div className="glass mx-auto flex h-14 w-full max-w-348 items-center gap-2 rounded-2xl px-3 sm:gap-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-expanded={sidebarOpen} aria-controls="atlas-sidebar" className="[&_svg]:size-5!">
          <PanelLeftIcon />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <div aria-hidden className="h-4 w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="shrink-0 text-sm font-semibold">{title}</h1>
          <p className="hidden truncate text-sm text-muted-foreground sm:block">{description}</p>
        </div>
        <a
          href="#settings"
          title={live ? "Live mode: trades you approve use real money. Change it under Settings." : "Paper mode: nothing real is traded. Change it under Settings."}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
            live ? "border-live/40 bg-live/10 text-live hover:bg-live/15" : "border-white/12 bg-white/[0.05] text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {live ? "Live" : "Paper"}
          <span className="sr-only"> mode</span>
        </a>
        <Button size="sm" variant="outline" onClick={onAsk} className="shrink-0">
          Ask Atlas
        </Button>
      </div>
    </header>
  );
}
