import "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { SESSION_COOKIE, sessionToken } from "../src/lib/auth";

const BASE = "http://localhost:3000";
const request = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(`${BASE}${path}`, init);
const write = (path: string, headers: Record<string, string> = {}) => request(path, { method: "POST", headers: { "content-type": "application/json", ...headers } });
/** Next marks "carry on to the route" with this header. */
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

beforeEach(() => {
  delete process.env.ATLAS_PASSWORD;
  delete process.env.VERCEL;
});

test("on your own computer, with no password, pages and reads go straight through", () => {
  assert.ok(passes(proxy(request("/"))));
  assert.ok(passes(proxy(request("/api/state"))));
});

test("writes are accepted from the Atlas page, the extension, or a non-browser client", () => {
  assert.ok(passes(proxy(write("/api/scan", { origin: BASE }))));
  assert.ok(passes(proxy(write("/api/import", { origin: "chrome-extension://abcdefgh" }))));
  assert.ok(passes(proxy(write("/api/scan"))), "no Origin header: not a browser page");
});

test("a write from another website is refused", async () => {
  const res = proxy(write("/api/action", { origin: "https://evil.example" }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /must come from the Atlas page/);
  assert.equal(proxy(write("/api/action", { origin: "http://localhost:4000" })).status, 403, "another port is another site");
});

test("a write that isn't JSON is refused, so a plain cross-site form can't post", () => {
  const form = request("/api/action", { method: "POST", headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(proxy(form).status, 415);
  assert.equal(proxy(request("/api/action", { method: "POST", headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal(proxy(request("/api/action", { method: "POST" })).status, 415);
});

test("with a password set, nothing is served without the session cookie", async () => {
  process.env.ATLAS_PASSWORD = "open sesame";
  const page = proxy(request("/?connected=1"));
  assert.equal(page.status, 307);
  assert.equal(page.headers.get("location"), `${BASE}/login`);

  const read = proxy(request("/api/state"));
  assert.equal(read.status, 401);
  assert.match((await read.json()).error, /Sign in to Atlas first/);
  assert.equal(proxy(write("/api/action", { origin: BASE })).status, 401);

  const stale = `${SESSION_COOKIE}=${sessionToken("an old password")}`;
  assert.equal(proxy(request("/api/state", { headers: { cookie: stale } })).status, 401, "changing the password signs everyone out");
});

test("with a password set, the session cookie opens pages and API calls", () => {
  process.env.ATLAS_PASSWORD = "open sesame";
  const cookie = `${SESSION_COOKIE}=${sessionToken()}`;
  assert.ok(passes(proxy(request("/", { headers: { cookie } }))));
  assert.ok(passes(proxy(request("/api/state", { headers: { cookie } }))));
  assert.ok(passes(proxy(write("/api/scan", { origin: BASE, cookie }))));
  // Signed in or not, a write from another site is still refused.
  assert.equal(proxy(write("/api/scan", { origin: "https://evil.example", cookie })).status, 403);
});

test("the sign-in page, the sign-in call and the cron route are reachable without a cookie", () => {
  process.env.ATLAS_PASSWORD = "open sesame";
  assert.ok(passes(proxy(request("/login"))));
  assert.ok(passes(proxy(write("/api/login", { origin: BASE }))));
  assert.ok(passes(proxy(request("/api/cron/daily"))), "it checks CRON_SECRET itself");
  // But the sign-in call still has to come from the Atlas page, as JSON.
  assert.equal(proxy(write("/api/login", { origin: "https://evil.example" })).status, 403);
});

test("on a public host with no password, Atlas refuses to serve anything", async () => {
  process.env.VERCEL = "1";
  const page = proxy(request("/"));
  assert.equal(page.status, 503);
  assert.match(await page.text(), /add ATLAS_PASSWORD/);
  assert.equal(proxy(request("/api/state")).status, 503);
  assert.equal(proxy(write("/api/scan", { origin: BASE })).status, 503);
  assert.equal(proxy(request("/api/cron/daily")).status, 503);

  process.env.ATLAS_PASSWORD = "open sesame";
  assert.equal(proxy(request("/")).status, 307, "with a password it asks for sign-in instead");
});
