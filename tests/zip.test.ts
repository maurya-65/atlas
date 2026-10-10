import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipFolder } from "../src/lib/zip";

// The setup page serves the extension and the skill as zips; Chrome and Claude must be able to open them.
// Python's zipfile is the reader: testzip() checks every CRC, and the script prints the entry names.
const READ = "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(' '.join(z.namelist()))";
const names = (zip: Buffer) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "zip-")), "a.zip");
  writeFileSync(file, zip);
  return execFileSync("python", ["-c", READ, file], { encoding: "utf8" }).trim().split(" ");
};

test("the extension zip has manifest.json and the icons at its top", () => {
  const list = names(zipFolder(path.join(process.cwd(), "extension")));
  assert.ok(list.includes("manifest.json"));
  assert.ok(list.includes("icons/icon-128.png"));
});

test("the skill zip keeps the skill folder at the top", () => {
  const list = names(zipFolder(path.join(process.cwd(), "claude-skill", "atlas-stock-research"), "atlas-stock-research/"));
  assert.ok(list.includes("atlas-stock-research/SKILL.md"));
  assert.ok(list.includes("atlas-stock-research/references/report-template.md"));
  assert.ok(list.every((n) => n.startsWith("atlas-stock-research/")));
});

test("zipping twice gives the same bytes", () => {
  const dir = path.join(process.cwd(), "extension");
  assert.ok(zipFolder(dir).equals(zipFolder(dir)));
  assert.equal(readFileSync(path.join(dir, "manifest.json"), "utf8").includes("Atlas Deep Research"), true);
});
