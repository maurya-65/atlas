"use client";

import { useCallback, useState } from "react";
import { ActivityPill, Toasts } from "@/components/Activity";
import AppSidebar from "@/components/AppSidebar";
import ChatView from "@/components/ChatView";
import DecisionsView from "@/components/DecisionsView";
import HistoryView from "@/components/HistoryView";
import HomeView from "@/components/HomeView";
import { pendingDecisions } from "@/components/derive";
import { XIcon } from "@/components/icons";
import { Thinking } from "@/components/Messages";
import PortfolioView from "@/components/PortfolioView";
import ResearchView from "@/components/ResearchView";
import SettingsView from "@/components/SettingsView";
import TopBar from "@/components/TopBar";
import { Button } from "@/components/ui";
import { useAtlas, type Atlas } from "@/components/useAtlas";
import type { ViewProps } from "@/components/viewProps";
import { routeFromHash, useHash, VIEWS } from "@/components/views";
import WatchingView from "@/components/WatchingView";

const PAGES = {
  home: HomeView,
  portfolio: PortfolioView,
  research: ResearchView,
  decisions: DecisionsView,
  watching: WatchingView,
  history: HistoryView,
  settings: SettingsView,
} as const;

export default function Page() {
  const loading = useAtlas();
  const route = routeFromHash(useHash());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenu(false), []);
  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen((open) => !open);
    else setMobileMenu((open) => !open);
  };

  const { state } = loading;
  if (!state) {
    return (
      <main className="atlas-wash grid flex-1 place-items-center p-8 text-center">
        {loading.loadError ? (
          <div className="max-w-md space-y-3">
            <p className="font-semibold">Atlas couldn’t load.</p>
            <p className="text-sm text-muted-foreground">{loading.loadError}</p>
            <Button variant="outline" onClick={loading.refresh}>
              Try again
            </Button>
          </div>
        ) : (
          <Thinking label="Loading Atlas…" />
        )}
      </main>
    );
  }

  const atlas: Atlas = { ...loading, state };
  const props: ViewProps = { atlas, route };
  const info = VIEWS.find((v) => v.id === route.view) ?? VIEWS[0];
  const latestChat = state.threads[0];

  return (
    <div data-slot="sidebar-wrapper" className="atlas-wash flex h-dvh w-full overflow-hidden">
      <AppSidebar
        view={route.view}
        chatHref={latestChat ? `#chat/${latestChat.id}` : "#chat"}
        openDecisions={pendingDecisions(state.messages).length}
        open={sidebarOpen}
        mobileOpen={mobileMenu}
        onCloseMobile={closeMobileMenu}
      />
      <div
        data-slot="sidebar-inset"
        className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-white/[0.015] md:my-2 md:mr-2 md:rounded-3xl md:border md:border-white/[0.08] ${sidebarOpen ? "" : "md:ml-2"}`}
      >
        <TopBar
          title={info.title}
          description={info.description}
          mode={state.mode}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
          activity={<ActivityPill jobs={atlas.jobs} />}
        />

        {atlas.error && (
          <div className="px-3 pt-3 sm:px-5">
            <div role="alert" className="glass mx-auto flex w-full max-w-348 items-start justify-between gap-3 rounded-2xl border-destructive/40 px-4 py-2.5 text-sm">
              <span>
                <span className="font-semibold text-destructive">That didn’t work.</span> {atlas.error}
              </span>
              <Button variant="ghost" size="xs" onClick={atlas.clearError} aria-label="Dismiss" className="px-1">
                <XIcon />
              </Button>
            </div>
          </div>
        )}

        {route.view === "chat" ? (
          <ChatView {...props} />
        ) : (
          <main key={route.view} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-348 space-y-4 px-3 py-5 sm:px-5">
              {(() => {
                const View = PAGES[route.view];
                return <View {...props} />;
              })()}
            </div>
          </main>
        )}
      </div>
      <Toasts jobs={atlas.jobs} />
    </div>
  );
}
