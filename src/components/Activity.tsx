"use client";

import { useEffect, useState } from "react";
import type { Job, Jobs } from "./jobs";
import { XIcon } from "./icons";
import { Button, cn } from "./ui";

function elapsed(job: Job): string {
  const seconds = Math.max(0, Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StatusDot({ status }: { status: Job["status"] }) {
  return (
    <span
      aria-hidden
      className={cn("mt-1.5 size-2 shrink-0 rounded-full", status === "running" ? "animate-pulse bg-white" : status === "failed" ? "bg-live" : "bg-white/40")}
    />
  );
}

/** What Atlas is doing right now, and what finished: the one place where running work is shown. */
export function ActivityPill({ jobs }: { jobs: Jobs }) {
  const [open, setOpen] = useState(false);
  const running = jobs.running.length;
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  const toggle = () => {
    if (!open) jobs.markSeen();
    setOpen((o) => !o);
  };

  return (
    <div className="relative shrink-0">
      <Button size="sm" variant="outline" onClick={toggle} aria-expanded={open}>
        {running > 0 && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-white" />}
        {running > 0 ? `${running} running` : jobs.unseen > 0 ? `${jobs.unseen} new` : "Activity"}
      </Button>
      {open && (
        <>
          <button type="button" aria-label="Close activity" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="glass-strong absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Activity</h2>
              {jobs.jobs.some((j) => j.status !== "running") && (
                <Button size="xs" variant="ghost" onClick={jobs.clearFinished}>
                  Clear finished
                </Button>
              )}
            </div>
            {jobs.jobs.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">Nothing is running. When you start a research or a check, it shows up here with its progress.</p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {jobs.jobs.map((job) => (
                  <li key={job.id} className="flex gap-2.5 rounded-xl px-2 py-2 text-sm hover:bg-white/[0.05]">
                    <StatusDot status={job.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{job.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{elapsed(job)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {job.status === "running" && (job.detail ?? "Working…")}
                        {job.status === "done" && "Done."}
                        {job.status === "failed" && (job.error ?? "It didn’t finish.")}
                      </p>
                      {job.status !== "failed" && (
                        <a href={job.landing.href} onClick={() => setOpen(false)} className="text-xs font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white">
                          {job.status === "done" ? "Open" : "Will be in"} {job.landing.text}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A short line that says where the result of what the user just started will appear. */
export function Toasts({ jobs }: { jobs: Jobs }) {
  if (jobs.toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {jobs.toasts.map((t) => (
        <div key={t.id} className="glass-strong pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl">
          <p className="flex-1">
            {t.text}
            {t.href && (
              <>
                {" "}
                <a href={t.href} className="font-medium underline decoration-white/25 underline-offset-4 hover:decoration-white">
                  Go there
                </a>
              </>
            )}
          </p>
          <Button variant="ghost" size="xs" onClick={() => jobs.dismissToast(t.id)} aria-label="Dismiss" className="px-1">
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
