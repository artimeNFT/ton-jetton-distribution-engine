import * as assert from "assert/strict";
import {
  preflightDecisionStorePath,
} from "../lib/watcher/decisionStore";

const LABEL = "[stage-d8-8-decision-store-path-preflight-smoke]";

function testValidPathPasses(): void {
  assert.deepEqual(preflightDecisionStorePath("data/decision-store/decisions.jsonl"), {
    ok: true,
    normalizedPath: "data/decision-store/decisions.jsonl",
  });
}

function testBackslashPathNormalizes(): void {
  assert.deepEqual(preflightDecisionStorePath("data\\decision-store\\decisions.jsonl"), {
    ok: true,
    normalizedPath: "data/decision-store/decisions.jsonl",
  });
}

function testRejectsAbsolutePath(): void {
  assert.equal(preflightDecisionStorePath("/data/decision-store/decisions.jsonl").ok, false);
}

function testRejectsWindowsAbsolutePath(): void {
  assert.equal(preflightDecisionStorePath("C:\\tmp\\decisions.jsonl").ok, false);
}

function testRejectsOutsidePrefix(): void {
  assert.equal(preflightDecisionStorePath("data/other/decisions.jsonl").ok, false);
}

function testRejectsTraversal(): void {
  assert.equal(preflightDecisionStorePath("data/decision-store/../x.jsonl").ok, false);
}

function testRejectsShellMetacharacter(): void {
  assert.equal(preflightDecisionStorePath("data/decision-store/decisions;rm.jsonl").ok, false);
}

function testRejectsEmptySegment(): void {
  assert.equal(preflightDecisionStorePath("data/decision-store//decisions.jsonl").ok, false);
}

function main(): void {
  testValidPathPasses();
  testBackslashPathNormalizes();
  testRejectsAbsolutePath();
  testRejectsWindowsAbsolutePath();
  testRejectsOutsidePrefix();
  testRejectsTraversal();
  testRejectsShellMetacharacter();
  testRejectsEmptySegment();
  console.log(`${LABEL} PASS`);
}

main();
