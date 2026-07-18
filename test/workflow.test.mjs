import assert from "node:assert/strict";
import test from "node:test";
import { fetchWorkflow } from "../src/workflow.mjs";

const request = { ref: "main" };
const response = (body, length = null) => ({
  ok: true,
  headers: { get: () => length },
  text: async () => body,
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
