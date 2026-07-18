import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { fetchWorkflow } from "../src/workflow.mjs";

const request = { ref: "main" };
const FIXTURE_ROOT = "/Users/ardjo/CODE/repos/ascii-box-lead-workflow";
const response = (body, length = null) => ({
  ok: true,
  headers: { get: () => length },
  text: async () => body,
});

test("loads the manifest-declared public source ledger", async () => {
  const workflow = await fetchWorkflow(request, async (url) => {
    const relativePath = new URL(url).pathname.split("/main/")[1];
    return response(await fs.readFile(`${FIXTURE_ROOT}/${relativePath}`, "utf8"));
  });
  assert.equal(workflow.cases.evidence_mode, "frozen_public_professional");
  assert.equal(workflow.sourceLedger.workflow_version, workflow.benchmark.workflow_version);
  assert.ok(workflow.sourceLedger.sources.length >= 10);
});

test("rejects malformed workflow JSON with a bounded client error", async () => {
  await assert.rejects(
    fetchWorkflow(request, async () => response("{broken")),
    (error) => error.status === 422 && /Malformed workflow JSON/.test(error.message),
  );
});

test("rejects oversized workflow before parsing", async () => {
  await assert.rejects(
    fetchWorkflow(request, async () => response("", "250001")),
    (error) => error.status === 413 && /too large/.test(error.message),
  );
});
