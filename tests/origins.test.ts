import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

// Which addresses the Chrome extension treats as Atlas. A wrong answer here would let the extension inject
// its script, or accept a research start, on a site that isn't the user's Atlas.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain-JS extension file, no types
const { normalizeOrigin, isLocalOrigin } = require("../extension/origins.js") as {
  normalizeOrigin: (input: unknown) => string | null;
  isLocalOrigin: (origin: string) => boolean;
};

test("a hosted address becomes a bare https origin", () => {
  assert.equal(normalizeOrigin("https://atlas.vercel.app"), "https://atlas.vercel.app");
  assert.equal(normalizeOrigin("  atlas.vercel.app/#inbox  "), "https://atlas.vercel.app");
  assert.equal(normalizeOrigin("HTTPS://My-Atlas.Example.com/login?x=1"), "https://my-atlas.example.com");
});

test("localhost keeps http and its port", () => {
  assert.equal(normalizeOrigin("localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeOrigin("http://127.0.0.1:3111/"), "http://127.0.0.1:3111");
  assert.ok(isLocalOrigin("http://localhost:3000"));
  assert.ok(!isLocalOrigin("https://atlas.vercel.app"));
  assert.ok(!isLocalOrigin("http://localhost.evil.com"));
});

test("anything that isn't a plain https hostname is refused", () => {
  for (const bad of [
    "http://atlas.vercel.app", // not https
    "https://atlas.vercel.app:8443", // custom port
    "https://user:pw@atlas.vercel.app", // credentials
    "https://*.vercel.app", // wildcard
    "https://192.168.1.5", // bare IP
    "https://intranet", // no dot
    "https://claude.ai",
    "https://www.claude.ai",
    "ftp://atlas.vercel.app",
    "chrome://extensions",
    "javascript:alert(1)",
    "two words",
    "",
    42,
    null,
  ]) {
    assert.equal(normalizeOrigin(bad), null, String(bad));
  }
});
