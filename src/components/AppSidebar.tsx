"use client";

import { useEffect, type ReactNode } from "react";
import { ClockIcon, DashboardIcon, EyeIcon, GlobeIcon, InboxIcon, MessageIcon, PieIcon, PlugIcon, SearchIcon, XIcon } from "./icons";
import { Button, cn } from "./ui";
import { VIEWS, viewHref, type View } from "./views";

const ICONS: Record<View, ReactNode> = {
  home: <DashboardIcon />,
  portfolio: <PieIcon />,
  research: <SearchIcon />,
  chat: <MessageIcon />,
  decisions: <InboxIcon />,
  watching: <EyeIcon />,
  history: <ClockIcon />,
  settings: <PlugIcon />,
};

// The sections follow the order of the work: look, understand, decide, review.
const GROUPS: { label: string; views: View[] }[] = [
  { label: "Your money", views: ["home", "portfolio"] },
  { label: "Understand", views: ["research", "chat"] },
  { label: "Decide and watch", views: ["decisions", "watching"] },
  { label: "Review", views: ["history"] },
  { label: "Setup", views: ["settings"] },
];

const EYEBROW = "text-[11px] font-medium tracking-wider text-sidebar-foreground/50 uppercase";

interface BodyProps {
  view: View;
  /** Where "Chat" goes: the latest chat, or a new one */
  chatHref: string;
  openDecisions: number;
  onNavigate?: () => void;
  onClose?: () => void;
}

function SidebarBody({ view, chatHref, openDecisions, onNavigate, onClose }: BodyProps) {
  return (
    <div data-slot="sidebar-inner" className="flex size-full flex-col text-sidebar-foreground">
      <div data-slot="sidebar-header" className="flex items-center justify-between gap-2 p-2">
        <a href={viewHref("home")} onClick={onNavigate} className="flex h-12 min-w-0 items-center gap-2.5 rounded-xl p-2">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black [&>svg]:size-5">
            <GlobeIcon />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight text-nowrap">Atlas</span>
            <span className="text-xs font-light text-nowrap text-muted-foreground">AI investing agent</span>
          </span>
        </a>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon />
            <span className="sr-only">Close menu</span>
          </Button>
        )}
      </div>

      <nav data-slot="sidebar-content" aria-label="Sections" className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {GROUPS.map((group) => (
          <div key={group.label} data-slot="sidebar-group" className="relative flex w-full min-w-0 flex-col p-2">
            <div data-slot="sidebar-group-label" className={cn("flex h-8 shrink-0 items-center px-2", EYEBROW)}>
              {group.label}
            </div>
            <ul data-slot="sidebar-menu" className="flex w-full min-w-0 flex-col gap-1">
              {group.views.map((id) => {
                const info = VIEWS.find((v) => v.id === id)!;
                const active = id === view;
                return (
                  <li key={id} data-slot="sidebar-menu-item" className="relative">
                    <a
                      href={id === "chat" ? chatHref : viewHref(id)}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      data-slot="sidebar-menu-button"
                      className={cn(
                        "relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-xl border border-transparent px-2.5 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                        active
                          ? "border-white/10 bg-white/[0.09] font-medium text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
                          : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                      )}
                    >
                      {ICONS[id]}
                      <span className="truncate">{info.label}</span>
                      {id === "decisions" && openDecisions > 0 && (
                        <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-full border border-white/15 bg-white/[0.1] px-2 text-[11px] font-medium text-foreground">
                          {openDecisions}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

interface Props extends Omit<BodyProps, "onNavigate" | "onClose"> {
  /** Desktop: the sidebar column is showing */
  open: boolean;
  /** Narrow windows: the sidebar is showing as an overlay */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function AppSidebar({ open, mobileOpen, onCloseMobile, ...body }: Props) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <div
        id="atlas-sidebar"
        data-slot="sidebar-container"
        inert={!open}
        className={cn("hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-linear md:block", open ? "w-60" : "w-0")}
      >
        <div className="h-full w-60 p-2">
          <SidebarBody {...body} />
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={onCloseMobile} className="absolute inset-0 cursor-default bg-black/60" />
          <div className="glass-strong absolute inset-y-0 left-0 w-72 max-w-[85vw] p-2">
            <SidebarBody {...body} onNavigate={onCloseMobile} onClose={onCloseMobile} />
          </div>
        </div>
      )}
    </>
  );
}
