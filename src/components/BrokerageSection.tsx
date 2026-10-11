"use client";

import ModeControl from "./ModeControl";
import { money } from "./format";
import type { ViewProps } from "./viewProps";
import { Badge, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Select, buttonClass } from "./ui";

function Account({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  const selected = state.accounts.find((a) => a.id === state.selectedAccountId) ?? state.accounts[0];
  const status = !state.snaptradeConfigured ? (
    <Badge variant="secondary">Demo portfolio</Badge>
  ) : state.connected ? (
    <Badge variant="up">Connected</Badge>
  ) : (
    <Badge variant="secondary">Not connected</Badge>
  );
  return (
    <Card id="brokerage">
      <CardHeader>
        <CardTitle>Brokerage</CardTitle>
        <CardDescription>
          Where Atlas reads your holdings, balances and orders. SnapTrade is the secure service that links Atlas to your brokerage. Atlas can’t place a trade unless you approve
          one.
        </CardDescription>
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
                <Select value={selected?.id} onChange={(e) => actions.selectAccount(e.target.value)}>
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
            <p className="text-xs text-muted-foreground">
              Shown as broker, then the account’s name at that broker.
              {/sandbox/i.test(selected?.institution ?? "") && " “Sandbox” is SnapTrade’s practice brokerage: it works like a real one but holds pretend money."}
              {/\bIRA\b/.test(state.accounts.map((a) => a.name).join(" ")) && " An IRA is a US retirement account."}
            </p>
            {selected && (
              <p className="text-muted-foreground">
                {selected.isPaper
                  ? "Your broker marks this as a practice account, so even real-money orders use the broker’s practice money."
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

function Mode({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  return (
    <Card id="mode">
      <CardHeader>
        <CardTitle>Paper or real money</CardTitle>
        <CardDescription>
          In paper mode, trades you approve change a practice copy of your account and no real money moves. In live mode, they become real orders at your
          broker, up to {money(state.limits.perTrade, 0)} a trade and {money(state.limits.perDay, 0)} a day.
        </CardDescription>
      </CardHeader>
      <CardContent className="-my-3">
        <ModeControl state={state} onSwitch={actions.switchMode} />
      </CardContent>
    </Card>
  );
}

export default function BrokerageSection({ atlas }: Pick<ViewProps, "atlas">) {
  return (
    <>
      <Account atlas={atlas} />
      <Mode atlas={atlas} />
    </>
  );
}
