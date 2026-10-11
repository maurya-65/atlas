"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import ReportImport from "./ReportImport";
import { useExtensionReady } from "./useExtensionReady";
import type { ViewProps } from "./viewProps";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonClass } from "./ui";

const CODE = "rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-foreground";
const SNAPTRADE_URL = "https://mcp.snaptrade.com/mcp";
const STRONG = "text-foreground";
const LINK = "font-medium text-foreground underline underline-offset-4";

const subscribeNothing = () => () => {};

/** The address this page is open at, once it's in the browser; "" on the server. */
const usePageOrigin = () => useSyncExternalStore(subscribeNothing, () => window.location.origin, () => "");

const isLocalAddress = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function CopyButton({ text }: { text: string }) {
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
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status: ReactNode; children: ReactNode }) {
  return (
    <li className="space-y-2.5 border-t border-white/[0.08] px-(--card-pad) py-4 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-medium">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-black">
            {n}
          </span>
          {title}
        </h3>
        {status}
      </div>
      <div className="space-y-2.5 pl-8.5 text-muted-foreground">{children}</div>
    </li>
  );
}

const Steps = ({ children }: { children: ReactNode }) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-foreground">{children}</ol>;

const OPTIONAL = <Badge variant="soft">Optional</Badge>;

export default function ClaudeSection({ atlas }: Pick<ViewProps, "atlas">) {
  const extensionReady = useExtensionReady();
  const origin = usePageOrigin();
  // Atlas on this computer needs nothing more; any other address (a hosted copy) is added in the extension once.
  // On such an address the extension only attaches after that, so "installed" means the address was added too.
  const needsAddress = origin !== "" && !isLocalAddress(origin);

  return (
    <div id="claude" className="grid grid-cols-1 gap-4 sm:gap-5">
      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Research in Claude</CardTitle>
          <CardDescription>
            Claude can do a long research on a stock itself, on your own Claude plan. Once the Chrome extension below is set up, a button to do this shows
            up next to Atlas’s own research: one click opens Claude with Research on and the prompt filled in, and the finished report comes back to Atlas
            as a card by itself. Setup takes about five minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ol>
            <Step n={1} title="Check your Claude plan" status={<Badge variant="secondary">Check yourself</Badge>}>
              <p>Claude’s Research mode needs a paid plan (Pro or higher). The free plan doesn’t have it.</p>
              <Steps>
                <li>
                  Sign in at{" "}
                  <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className={LINK}>
                    claude.ai
                  </a>{" "}
                  in the same Chrome you use for Atlas.
                </li>
                <li>
                  In a new chat, click the <strong className={STRONG}>+</strong> button. If you see <strong className={STRONG}>Research</strong>, you’re set.
                </li>
              </Steps>
            </Step>

            <Step n={2} title="Add the Atlas extension to Chrome" status={<Badge variant={extensionReady ? "up" : "secondary"}>{extensionReady ? "Installed" : "Not found"}</Badge>}>
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
                  Turn on <strong className={STRONG}>Developer mode</strong> (top right).
                </li>
                <li>
                  Click <strong className={STRONG}>Load unpacked</strong> and choose the unzipped folder.
                </li>
                {needsAddress && (
                  <li>
                    Click the puzzle-piece icon in Chrome’s toolbar and choose <strong className={STRONG}>Atlas Deep Research</strong>. A page opens: paste this
                    Atlas address, click <strong className={STRONG}>Add address</strong> and allow access when Chrome asks: <code className={CODE}>{origin}</code>{" "}
                    <CopyButton text={origin} />
                  </li>
                )}
                <li>Come back to this page and reload it. The badge above turns to “Installed”.</li>
              </Steps>
              <p className="text-xs">
                Chrome may remind you that a developer-mode extension is on. That’s expected.
                {needsAddress && " Keep an Atlas tab open while a research runs; the report is handed to it."}
              </p>
            </Step>

            <Step n={3} title="Run your first research" status={<Badge variant="secondary">When ready</Badge>}>
              <Steps>
                <li>
                  Open <a href="#research/new" className={LINK}>Research → New research</a>, type a ticker such as <code className={CODE}>AAPL</code> and press{" "}
                  <strong className={STRONG}>Research in Claude</strong>, which appears next to Research once the extension is set up. The same button is on every company’s page.
                </li>
                <li>A Claude tab opens with Research turned on and the prompt filled in. Read it, then press send.</li>
                <li>Keep that tab open for about 10 minutes. A small badge in its corner shows progress.</li>
                <li>When it finishes, the report is on that company’s page in Research. Nothing is bought or sold unless you approve it.</li>
              </Steps>
            </Step>

            <Step n={4} title="Add the Atlas research skill" status={OPTIONAL}>
              <p>A skill that gives Claude the full method and report format for these researches. Research works without it, just less strictly.</p>
              <a href="/api/download?file=skill" download className={buttonClass("outline")}>
                Download the skill
              </a>
              <Steps>
                <li>
                  In Claude, open <strong className={STRONG}>Settings → Customize → Skills</strong>.
                </li>
                <li>Upload the zip as it is, without unzipping it.</li>
                <li>Make sure code execution is turned on in Claude’s settings; skills need it.</li>
              </Steps>
            </Step>

            <Step n={5} title="Let Claude read your real holdings" status={OPTIONAL}>
              <p>Connect SnapTrade to Claude so a research starts from what you actually own. It only reads; trades still need your click in Atlas.</p>
              <Steps>
                <li>
                  In Claude, open <strong className={STRONG}>Customize → Connectors</strong> and click <strong className={STRONG}>Add → Add custom connector</strong>.
                </li>
                <li>
                  Name it <code className={CODE}>SnapTrade</code> and use this address: <code className={CODE}>{SNAPTRADE_URL}</code> <CopyButton text={SNAPTRADE_URL} />
                </li>
                <li>
                  Click <strong className={STRONG}>Connect</strong> and approve read access in SnapTrade.
                </li>
              </Steps>
            </Step>
          </ol>
        </CardContent>
      </Card>

      <ReportImport atlas={atlas} />

      <Card>
        <CardHeader>
          <CardTitle>If something doesn’t work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-muted-foreground">
          <p>
            <strong className={STRONG}>The badge still says “Not found”:</strong> reload this page. If it stays, open <code className={CODE}>chrome://extensions</code>,
            check Atlas Deep Research is switched on, and press its reload icon.
            {needsAddress && " Then make sure this address was added in the extension (puzzle-piece icon → Atlas Deep Research)."}
          </p>
          <p>
            <strong className={STRONG}>“Couldn’t turn on Research mode”:</strong> check step 1, then reload the extension and start the research again.
          </p>
          <p>
            <strong className={STRONG}>No report after Claude finished:</strong> make sure Atlas is still running{needsAddress ? " and open in a tab" : ""}, then copy
            Claude’s whole answer into the box above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
