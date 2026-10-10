"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, buttonClass } from "./ui";

const CODE = "rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-foreground";
const SNAPTRADE_URL = "https://mcp.snaptrade.com/mcp";

function subscribeExtension(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-atlas-extension"] });
  return () => obs.disconnect();
}

/** True when the Atlas Chrome extension has attached to this tab (it sets a flag on the page). */
export function useExtensionReady() {
  return useSyncExternalStore(
    subscribeExtension,
    () => document.documentElement.dataset.atlasExtension === "ready",
    () => false,
  );
}

const subscribeNothing = () => () => {};

/** The address this page is open at, once it's in the browser; "" on the server. */
function usePageOrigin() {
  return useSyncExternalStore(subscribeNothing, () => window.location.origin, () => "");
}

const isLocalAddress = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard blocked: the text is on screen to copy by hand
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-black">
            {n}
          </span>
          {title}
        </CardTitle>
        {status && <CardAction>{status}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-3 text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

const Steps = ({ children }: { children: ReactNode }) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-foreground">{children}</ol>;

export default function ClaudeSetupView() {
  const extensionReady = useExtensionReady();
  const origin = usePageOrigin();
  // Atlas on this computer needs nothing more; any other address (a hosted copy) is added in the extension once.
  const needsAddress = origin !== "" && !isLocalAddress(origin);
  return (
    <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Deeper research in Claude</CardTitle>
          <CardDescription>
            The “Deep research in Claude” buttons run a long research in Claude itself, on your own Claude plan. With the Chrome extension below, one
            click opens Claude with Research on and the prompt filled in, and the finished report comes back here as a card by itself. It takes about
            five minutes to set up.
          </CardDescription>
        </CardHeader>
      </Card>

      <Step n={1} title="Check your Claude plan">
        <p>Claude’s Research mode needs a paid plan (Pro or higher). The free plan doesn’t have it.</p>
        <Steps>
          <li>
            Sign in at{" "}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4">
              claude.ai
            </a>{" "}
            in the same Chrome you use for Atlas.
          </li>
          <li>
            In a new chat, click the <strong className="text-foreground">+</strong> button. If you see <strong className="text-foreground">Research</strong>, you’re set.
          </li>
        </Steps>
      </Step>

      <Step n={2} title="Add the Atlas extension to Chrome" status={<Badge variant={extensionReady ? "up" : "secondary"}>{extensionReady ? "Extension installed" : "Extension not found"}</Badge>}>
        <a href="/api/download?file=extension" download className={buttonClass("default")}>
          Download the extension
        </a>
        <Steps>
          <li>
            Unzip the file you downloaded. You get a folder with <code className={CODE}>manifest.json</code> inside. Keep it somewhere permanent: Chrome
            reads the extension from that folder every time it starts.
          </li>
          <li>
            In Chrome, open a new tab and go to <code className={CODE}>chrome://extensions</code>.
          </li>
          <li>
            Turn on <strong className="text-foreground">Developer mode</strong> (top right).
          </li>
          <li>
            Click <strong className="text-foreground">Load unpacked</strong> and choose the unzipped folder.
          </li>
          {needsAddress && (
            <li>
              Click the puzzle-piece icon in Chrome’s toolbar and choose <strong className="text-foreground">Atlas Deep Research</strong>. A page opens: paste this
              Atlas address, click <strong className="text-foreground">Add address</strong> and allow access when Chrome asks:{" "}
              <code className={CODE}>{origin}</code> <CopyButton text={origin} label="Copy" />
            </li>
          )}
          <li>Come back to this page and reload it. The badge above turns to “Extension installed”.</li>
        </Steps>
        <p className="text-xs">
          Chrome may remind you that a developer-mode extension is on. That’s expected.
          {needsAddress && " Keep an Atlas tab open while a research runs; the report is handed to it."}
        </p>
      </Step>

      <Step n={3} title="Run your first research">
        <Steps>
          <li>
            Open <a href="#chat" className="font-medium text-foreground underline underline-offset-4">Chat</a>, choose <strong className="text-foreground">Research a stock</strong>, type a
            ticker such as <code className={CODE}>AAPL</code> and click <strong className="text-foreground">Deep research in Claude</strong>.
          </li>
          <li>A Claude tab opens with Research turned on and the prompt filled in. Read it, then press send.</li>
          <li>Keep that tab open for about 10 minutes. A small badge in its corner shows progress.</li>
          <li>When it finishes, the card appears in your Inbox. Nothing is bought or sold unless you approve it there.</li>
        </Steps>
        <p className="text-xs">
          No extension? The same button still opens Claude with the prompt. Turn on Research yourself, press send, then paste Claude’s whole answer into
          “Bring back a Claude report” in{" "}
          <a href="#settings" className="font-medium text-foreground underline underline-offset-4">
            Settings
          </a>
          .
        </p>
      </Step>

      <Step n={4} title="Optional: add the Atlas research skill" status={<Badge variant="soft">Optional</Badge>}>
        <p>A skill that gives Claude the full method and report format for these researches. Research works without it, just less strictly.</p>
        <a href="/api/download?file=skill" download className={buttonClass("outline")}>
          Download the skill
        </a>
        <Steps>
          <li>
            In Claude, open <strong className="text-foreground">Settings → Customize → Skills</strong>.
          </li>
          <li>Upload the zip as it is, without unzipping it.</li>
          <li>Make sure code execution is turned on in Claude’s settings; skills need it.</li>
        </Steps>
      </Step>

      <Step n={5} title="Optional: let Claude read your real holdings" status={<Badge variant="soft">Optional</Badge>}>
        <p>Connect SnapTrade to Claude so a research starts from what you actually own. It only reads; trades still need your click in Atlas.</p>
        <Steps>
          <li>
            In Claude, open <strong className="text-foreground">Customize → Connectors</strong> and click <strong className="text-foreground">Add → Add custom connector</strong>.
          </li>
          <li>
            Name it <code className={CODE}>SnapTrade</code> and use this address: <code className={CODE}>{SNAPTRADE_URL}</code>{" "}
            <CopyButton text={SNAPTRADE_URL} label="Copy" />
          </li>
          <li>
            Click <strong className="text-foreground">Connect</strong> and approve read access in SnapTrade.
          </li>
        </Steps>
      </Step>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>If something doesn’t work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-muted-foreground">
          <p>
            <strong className="text-foreground">Badge still says “Extension not found”:</strong> reload this page. If it stays, open{" "}
            <code className={CODE}>chrome://extensions</code>, check Atlas Deep Research is switched on, and press its reload icon.
            {needsAddress && " Then make sure this address was added in the extension (puzzle-piece icon → Atlas Deep Research)."}
          </p>
          <p>
            <strong className="text-foreground">“Couldn’t turn on Research mode”:</strong> check step 1, then reload the extension and click the button again.
          </p>
          <p>
            <strong className="text-foreground">No card after Claude finished:</strong> make sure Atlas is still running
            {needsAddress ? " and open in a tab" : ""}, then copy Claude’s whole answer into “Bring back a Claude report” in Settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
