import { useCallback, useRef, useState } from "react";
import type { ResearchEvent } from "@/lib/types";

export type JobKind = "research" | "whatif" | "review" | "scan" | "morning" | "claude";

export interface Job {
  id: string;
  kind: JobKind;
  label: string;
  /** What it is doing right now, in a few words */
  detail: string | null;
  status: "running" | "done" | "failed";
  startedAt: number;
  finishedAt: number | null;
  /** Where the result will be found */
  landing: { text: string; href: string };
  /** What the research agents are saying, while an Atlas research runs */
  events: ResearchEvent[];
  error: string | null;
  /** False from the moment a job finishes until the user has looked at the Activity list */
  seen: boolean;
}

export interface Toast {
  id: string;
  text: string;
  href?: string;
}

export interface JobSpec {
  kind: JobKind;
  label: string;
  landing: Job["landing"];
  /** A second job with the same key joins the first instead of starting again */
  key?: string;
}

/** What a running job can report about itself. */
export interface JobHandle {
  id: string;
  setDetail: (detail: string | null) => void;
  addEvent: (event: ResearchEvent) => void;
}

const TOAST_MS = 9000;

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const keys = useRef(new Map<string, string>());

  const patch = useCallback((id: string, change: Partial<Job> | ((job: Job) => Partial<Job>)) => {
    setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...(typeof change === "function" ? change(j) : change) } : j)));
  }, []);

  const notify = useCallback((text: string, href?: string) => {
    const id = crypto.randomUUID();
    setToasts((all) => [...all, { id, text, href }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  /** Starts tracking a job. Returns its handle, or null when the same job is already running. */
  const begin = useCallback(
    (spec: JobSpec): JobHandle | null => {
      if (spec.key && keys.current.has(spec.key)) return null;
      const id = crypto.randomUUID();
      if (spec.key) keys.current.set(spec.key, id);
      const job: Job = { id, kind: spec.kind, label: spec.label, detail: null, status: "running", startedAt: Date.now(), finishedAt: null, landing: spec.landing, events: [], error: null, seen: true };
      setJobs((all) => [job, ...all].slice(0, 20));
      notify(`${spec.label} started. The result will be in ${spec.landing.text}.`, spec.landing.href);
      return {
        id,
        setDetail: (detail) => patch(id, { detail }),
        addEvent: (event) => patch(id, (j) => ({ events: [...j.events, event] })),
      };
    },
    [notify, patch],
  );

  const finish = useCallback(
    (handle: JobHandle, outcome: { error?: string }) => {
      for (const [key, id] of keys.current) if (id === handle.id) keys.current.delete(key);
      patch(handle.id, (j) => ({ status: outcome.error ? "failed" : "done", error: outcome.error ?? null, finishedAt: Date.now(), detail: null, events: [], seen: false, label: j.label }));
    },
    [patch],
  );

  /** Runs `work` as a job: shows it as running, then as done or failed. Resolves to true when it worked. */
  const run = useCallback(
    async (spec: JobSpec, work: (handle: JobHandle) => Promise<unknown>): Promise<boolean> => {
      const handle = begin(spec);
      if (!handle) return false;
      try {
        await work(handle);
        finish(handle, {});
        return true;
      } catch (e) {
        finish(handle, { error: (e as Error).message });
        return false;
      }
    },
    [begin, finish],
  );

  const markSeen = useCallback(() => setJobs((all) => all.map((j) => (j.status === "running" ? j : { ...j, seen: true }))), []);
  const clearFinished = useCallback(() => setJobs((all) => all.filter((j) => j.status === "running")), []);

  return {
    jobs,
    toasts,
    running: jobs.filter((j) => j.status === "running"),
    unseen: jobs.filter((j) => j.status !== "running" && !j.seen).length,
    begin,
    finish,
    run,
    notify,
    dismissToast,
    markSeen,
    clearFinished,
  };
}

export type Jobs = ReturnType<typeof useJobs>;
