"use client";

import { useSyncExternalStore } from "react";
import type { AppState } from "./format";
import { Badge, Button, buttonClass, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { useExtensionReady } from "./useExtensionReady";

const KEY = "atlas:getting-started-dismissed";

// The dismissal lives in localStorage when the browser allows it, and in this variable for the rest of the visit when it doesn't.
let dismissedThisVisit = false;
const listeners = new Set<() => void>();

function isDismissed() {
  if (dismissedThisVisit) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedThisVisit = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // blocked storage: the card stays hidden until the page is reloaded
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

interface Step {
  title: string;
  hint: string;
  done: boolean;
  optional?: boolean;
  href: string;
  action: string;
}

/** A short checklist for a new user. It goes away by itself once the two required steps are done. */
export default function GettingStarted({ state }: { state: AppState }) {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  const extensionReady = useExtensionReady();

  const steps: Step[] = [
    {
      title: "Connect your brokerage",
      hint: state.snaptradeConfigured ? "So Atlas can see what you really own." : "Until then Atlas shows a demo portfolio with made-up numbers.",
      done: state.connected,
      href: "#settings/brokerage",
      action: "Connect",
    },
    {
      title: "Turn on the morning check",
      hint: "Once a day Atlas looks at your portfolio and leaves a short brief here.",
      done: Boolean(state.daily?.enabled),
      href: "#watching",
      action: "Set it up",
    },
    {
      title: "Research in Claude",
      hint: "Runs a long research in Claude and brings the result back. Needs a paid Claude plan.",
      done: extensionReady,
      optional: true,
      href: "#settings/claude",
      action: "Set up",
    },
  ];

  const requiredDone = steps.filter((s) => !s.optional).every((s) => s.done);
  if (dismissed || requiredDone) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>
          Two quick steps and Atlas is working for you. New here? The{" "}
          <a href="#guide" className="font-medium text-foreground underline decoration-white/30 underline-offset-2 hover:decoration-white/70">
            Guide
          </a>{" "}
          explains every page.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="xs" onClick={dismiss}>
            Hide
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-white/[0.07]">
          {steps.map((step) => (
            <li key={step.title} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${step.done ? "border-white bg-white text-black" : "border-white/25 text-muted-foreground"}`}
              >
                {step.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {step.title}
                  {step.optional && <Badge variant="soft">Optional</Badge>}
                  {step.done && <span className="sr-only">(done)</span>}
                </div>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              </div>
              {!step.done && (
                <a href={step.href} className={buttonClass("outline", "sm")}>
                  {step.action}
                </a>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
