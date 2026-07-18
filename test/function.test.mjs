import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "../netlify/functions/evaluate.mjs";

test("rejects an unallowlisted repository before model work", async () => {
  const result = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ repository: "https://github.com/evil/repo" }),
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.body, /not allowlisted/);
});

test("missing credential response never exposes environment secrets", async () => {
  const previousOpenRouter = process.env.OPENROUTER_API_KEY;
  const previousOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.UNRELATED_TEST_SECRET = "never-return-this";
  const result = await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      repository: "https://github.com/ardjo-s/ascii-box-lead-workflow",
    }),
  });
  if (previousOpenRouter) process.env.OPENROUTER_API_KEY = previousOpenRouter;
  if (previousOpenAI) process.env.OPENAI_API_KEY = previousOpenAI;
  delete process.env.UNRELATED_TEST_SECRET;
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.includes("never-return-this"), false);
});
