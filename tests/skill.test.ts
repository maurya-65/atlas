import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildClaudePrompt, parseClaudeReport } from "../src/lib/handoff";

// The Claude skill in claude-skill/ tells Claude what to put in the ATLAS_RESULT block. These tests keep it
// in step with what Atlas actually accepts.
const skill = path.join(process.cwd(), "claude-skill", "atlas-stock-research");
const example = readFileSync(path.join(skill, "references", "example-result.json"), "utf8");
const report = (json: string) => `# EXMP\n\nThe report.\n\nATLAS_RESULT\n\`\`\`json\n${json}\n\`\`\`\n`;

test("the example in the skill imports as a research card with its citations intact", () => {
  const r = parseClaudeReport(report(example), "EXMP");
  assert.equal(r.stance, "hold_and_watch");
  assert.equal(r.confidenceScore, 62);
  assert.equal(r.sources.length, 5);
  assert.equal(r.angles?.length, 5);
  assert.match(r.thesis, /\[1\]\[2\]/);
});

test("the skill's checker agrees with Atlas about what is accepted", () => {
  const check = (text: string) => {
    const file = path.join(tmpdir(), `skill-check-${Math.random().toString(36).slice(2)}.md`);
    writeFileSync(file, text);
    try {
      execFileSync("python", [path.join(skill, "scripts", "check_result.py"), file], { stdio: "pipe" });
      return 0;
    } catch (e) {
      return (e as { status: number }).status;
    }
  };
  assert.equal(check(report(example)), 0);
  const bad = JSON.parse(example);
  bad.verdict = "buy now";
  assert.equal(check(report(JSON.stringify(bad))), 1);
  assert.throws(() => parseClaudeReport(report(JSON.stringify(bad))));
  assert.equal(check("no block here"), 1);
});

test("the prompt Atlas sends points Claude at the skill", () => {
  assert.match(buildClaudePrompt({ ticker: "EXMP" }), /Atlas stock research/);
});
