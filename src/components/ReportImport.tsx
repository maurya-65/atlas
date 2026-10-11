"use client";

import { useState } from "react";
import type { ViewProps } from "./viewProps";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "./ui";

type Status = { kind: "idle" | "working" | "done" } | { kind: "error"; message: string };

/** The fallback for when a report from Claude doesn't arrive by itself: paste the whole answer. */
export default function ReportImport({ atlas }: Pick<ViewProps, "atlas">) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submit = async () => {
    if (!text.trim()) return;
    setStatus({ kind: "working" });
    try {
      await atlas.actions.importReport(text);
      setText("");
      setStatus({ kind: "done" });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  };

  return (
    <Card id="report-import">
      <CardHeader>
        <CardTitle>Bring back a Claude report</CardTitle>
        <CardDescription>
          A report that didn’t arrive by itself? Copy Claude’s whole answer and paste it here. Atlas turns it into a research on that company’s page, with the
          verdict, the confidence score and buy or sell buttons.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="claude-report">
            Claude’s answer
          </label>
          <Textarea
            id="claude-report"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (status.kind !== "working") setStatus({ kind: "idle" });
            }}
            rows={5}
            placeholder="Paste Claude’s answer, including the ATLAS_RESULT part at the end…"
            className="resize-y"
          />
          <Button type="submit" variant="outline" disabled={status.kind === "working" || !text.trim()} className="mt-2 w-full">
            {status.kind === "working" ? "Importing…" : "Import report"}
          </Button>
        </form>
        {status.kind === "done" && (
          <p className="mt-2 text-foreground" role="status">
            Imported. You’ll find it in{" "}
            <a href="#research" className="font-medium underline decoration-white/30 underline-offset-2 hover:decoration-white/70">
              Research
            </a>
            .
          </p>
        )}
        {status.kind === "error" && (
          <p className="mt-2 text-live" role="alert">
            {status.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
