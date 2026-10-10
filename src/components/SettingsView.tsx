"use client";

import { useState, useSyncExternalStore } from "react";
import { timeAgo } from "./format";
import { ResetIcon } from "./icons";
import ModeControl from "./ModeControl";
import type { ViewProps } from "./Sections";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Select, Textarea, buttonClass } from "./ui";

function subscribeExtension(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-atlas-extension"] });
  return () => obs.disconnect();
}

function AccountCard({ state, onSelectAccount }: Pick<ViewProps, "state" | "onSelectAccount">) {
  const selected = state.accounts.find((a) => a.id === state.selectedAccountId) ?? state.accounts[0];
  const status = !state.snaptradeConfigured ? (
    <Badge variant="secondary">Demo portfolio</Badge>
  ) : state.connected ? (
    <Badge variant="up">Connected</Badge>
  ) : (
    <Badge variant="secondary">Not connected</Badge>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brokerage</CardTitle>
        <CardDescription>Where Atlas reads your holdings, balances and orders, through SnapTrade. It can’t place a trade unless you approve one.</CardDescription>
        <CardAction>{status}</CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state.snaptradeConfigured ? (
          <p className="text-muted-foreground">
            SnapTrade keys aren’t set up on this server yet, so Atlas is showing a <strong className="text-foreground">demo portfolio</strong> with
            made-up numbers. Add <code className="font-mono text-xs">SNAPTRADE_CLIENT_ID</code> and{" "}
            <code className="font-mono text-xs">SNAPTRADE_CONSUMER_KEY</code> to connect a real account.
          </p>
        ) : !state.connected ? (
          <>
            <p className="text-muted-foreground">Connect your existing brokerage. You log in on SnapTrade’s page; Atlas never sees your password.</p>
            <a href="/api/connect" className={buttonClass("default")}>
              Connect your brokerage
            </a>
          </>
        ) : (
          <>
            {state.accounts.length > 1 ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Account Atlas uses</span>
                <Select value={selected?.id} onChange={(e) => onSelectAccount(e.target.value)}>
                  {state.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.institution} — {a.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <div className="font-medium">
                {selected?.institution} — {selected?.name}
              </div>
            )}
            {selected && (
              <p className="text-muted-foreground">
                {selected.isPaper
                  ? "Your broker marks this as a practice (paper) account, so even live-mode orders use the broker’s practice money."
                  : "This is a real-money account at your broker."}
              </p>
            )}
            {state.portfolioError && <p className="text-xs text-live">Couldn’t load your portfolio: {state.portfolioError}</p>}
            <a href="/api/connect" className={buttonClass("outline", "sm")}>
              Add another
            </a>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ModeCard({ state, onSwitchMode }: Pick<ViewProps, "state" | "onSwitchMode">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paper or real money</CardTitle>
        <CardDescription>
          In paper mode, trades you approve change a simulated copy of your account and no real money moves. In live mode, they become real orders
          at your broker, up to $25 a trade and $100 a day.
        </CardDescription>
      </CardHeader>
      <CardContent className="-my-3">
        <ModeControl state={state} onSwitch={onSwitchMode} />
      </CardContent>
    </Card>
  );
}

function ImportCard({ onImport, busy }: Pick<ViewProps, "onImport" | "busy">) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });
  const submit = async () => {
    if (!text.trim()) return;
    setStatus({ kind: "working" });
    try {
      await onImport(text);
      setText("");
      setStatus({ kind: "done" });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bring back a Claude report</CardTitle>
        <CardDescription>
          Ran a Deep Research in Claude? Copy Claude’s whole answer and paste it here. Atlas turns it into a card in your Inbox, with the verdict, the
          confidence score and buy/sell buttons.
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
          <Button type="submit" variant="outline" disabled={busy || status.kind === "working" || !text.trim()} className="mt-2 w-full">
            {status.kind === "working" ? "Importing…" : "Import report"}
          </Button>
        </form>
        {status.kind === "done" && (
          <p className="mt-2 text-foreground" role="status">
            Imported. The card is in your Inbox.
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

function ClaudeCard() {
  const extensionReady = useSyncExternalStore(
    subscribeExtension,
    () => document.documentElement.dataset.atlasExtension === "ready",
    () => false,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude Deep Research</CardTitle>
        <CardDescription>
          Optional. A longer research run in Claude itself, started from the “Deep research in Claude” buttons. Claude’s Research mode needs a paid Claude plan
          (Pro or higher).
        </CardDescription>
        <CardAction>
          <Badge variant={extensionReady ? "up" : "secondary"}>{extensionReady ? "Extension installed" : "Extension not found"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 text-muted-foreground">
        <p>
          {extensionReady
            ? "The Atlas Chrome extension is active in this tab. The button opens Claude with Research mode on and the prompt filled in; you press send and the card arrives in your Inbox by itself."
            : "Without the Atlas Chrome extension, the button opens claude.ai with the prompt filled in. You turn on Research, press send, and paste the answer into the box on this page."}
        </p>
        <p>You can also add Atlas to the Claude app, so Claude can use your portfolio and rules. The steps are in the project’s README.</p>
      </CardContent>
    </Card>
  );
}

function MemoryCard({ state, onClearMemory }: Pick<ViewProps, "state" | "onClearMemory">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What Atlas remembers</CardTitle>
        <CardDescription>One line from each answer in Chat, and from conversations in Claude, so later answers have context.</CardDescription>
        {state.memory.length > 0 && (
          <CardAction>
            <Button variant="outline" size="xs" onClick={onClearMemory}>
              Forget all
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {state.memory.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Ask Atlas a question in Chat and a note appears here.</p>
        ) : (
          <ul className="space-y-2.5">
            {[...state.memory].reverse().map((n) => (
              <li key={n.at}>
                {n.text}
                <span className="block text-xs text-muted-foreground">
                  {timeAgo(n.at)}
                  {n.from === "claude" && " · from Claude"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StartOverCard({ state, busy, onReset, onSignOut }: Pick<ViewProps, "state" | "busy" | "onReset" | "onSignOut">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start over</CardTitle>
      </CardHeader>
      <CardContent className="-my-3 divide-y divide-white/[0.07]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Clear everything Atlas has saved</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chats, notes, topics and the simulated portfolio are cleared, and the rules go back to the defaults. Your brokerage stays connected.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} disabled={busy}>
            <ResetIcon />
            Start over
          </Button>
        </div>
        {state.passwordProtected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Sign out</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Atlas asks for the password again on this device.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsView(props: ViewProps) {
  return (
    <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
      <AccountCard state={props.state} onSelectAccount={props.onSelectAccount} />
      <ModeCard state={props.state} onSwitchMode={props.onSwitchMode} />
      <ClaudeCard />
      <ImportCard onImport={props.onImport} busy={props.busy} />
      <MemoryCard state={props.state} onClearMemory={props.onClearMemory} />
      <StartOverCard state={props.state} busy={props.busy} onReset={props.onReset} onSignOut={props.onSignOut} />
    </div>
  );
}
