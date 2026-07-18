import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { createHandler } from "../netlify/functions/run.mjs";
import {
  actionOutputFromReport,
  createBlobOperationStore,
  GINSE_APP_ID,
  GINSE_ISSUER,
  providerOperationId,
  requestFingerprint,
  verifyGinseBearer,
} from "../src/ginse.mjs";

const repository = "https://github.com/ardjo-s/ascii-box-lead-workflow";

const report = {
  recommendation: {
    model: "gpt-5.6-luna",
    confidence: "demo-low",
    reason: "gpt-5.6-luna tied on quality and used the least measured cost.",
  },
  ranking: [
    {
      model: "gpt-5.6-luna",
      status: "completed",
      eligible: true,
      latency_ms: 8_647,
      measured_provider_cost_usd: 0.008738037,
      score: {
        quality_score: 0.883,
        role_f1: 0.833,
        evidence_exactness: 1,
        company_fit_accuracy: 1,
      },
      ineligible_reasons: [],
    },
    {
      model: "gpt-5.6-terra",
      status: "completed",
      eligible: true,
      latency_ms: 9_220,
      measured_provider_cost_usd: 0.0204491925,
      score: {
        quality_score: 0.883,
        role_f1: 0.833,
        evidence_exactness: 1,
        company_fit_accuracy: 1,
      },
      ineligible_reasons: [],
    },
  ],
  skipped_models: [{ model: "gpt-5.6-sol", reason: "Not accessible." }],
  failed_models: [],
  limitations: ["Five frozen cases.", "One trial per model."],
};

const jsonBody = (result) => JSON.parse(result.body);

function createMemoryStore() {
  const records = new Map();
  return {
    async claim(operationId, record) {
      if (records.has(operationId)) return { modified: false };
      records.set(operationId, { record: structuredClone(record), etag: "v1" });
      return { modified: true, etag: "v1" };
    },
    async get(operationId) {
      return records.has(operationId) ? structuredClone(records.get(operationId).record) : null;
    },
    async finish(operationId, record, etag) {
      assert.equal(records.get(operationId)?.etag, etag);
      records.set(operationId, { record: structuredClone(record), etag: "v2" });
      return { modified: true, etag: "v2" };
    },
  };
}

function tokenFixture(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = "test-key";
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid, typ: "JWT" })).toString("base64url");
  const now = 1_750_000_000;
  const payload = Buffer.from(JSON.stringify({
    iss: GINSE_ISSUER,
    aud: GINSE_APP_ID,
    iat: now,
    exp: now + 120,
    ...overrides,
  })).toString("base64url");
  const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  const jwk = publicKey.export({ format: "jwk" });
  return {
    authorization: `Bearer ${header}.${payload}.${signature}`,
    jwks: { keys: [{ ...jwk, kid, alg: "EdDSA", use: "sig" }] },
    now: () => now * 1_000,
  };
}

test("verifies a bound, unexpired Ginse Ed25519 bearer", async () => {
  const fixture = tokenFixture();
  await verifyGinseBearer(fixture.authorization, fixture);
  const expired = tokenFixture({ exp: 1_749_999_000 });
  await assert.rejects(
    verifyGinseBearer(expired.authorization, expired),
    /Invalid Ginse token claims/,
  );
});

test("canonical fingerprints ignore object key order", () => {
  assert.equal(
    requestFingerprint({ repository, nested: { b: 2, a: 1 } }),
    requestFingerprint({ nested: { a: 1, b: 2 }, repository }),
  );
});

test("connects the legacy Lambda event before opening Netlify Blobs", () => {
  const event = { headers: { host: "example.netlify.app" } };
  const calls = [];
  createBlobOperationStore(
    event,
    (options) => {
      calls.push(["store", options]);
      return {};
    },
    (value) => calls.push(["connect", value]),
  );
  assert.deepEqual(calls, [
    ["connect", event],
    ["store", { name: "ginse-lead-router-runs", consistency: "strong" }],
  ]);
});

test("maps the report to the stable table-shaped Ginse output", () => {
  const output = actionOutputFromReport(report);
  assert.equal(output.recommended_model, "gpt-5.6-luna");
  assert.equal(output.measured_total_cost_usd, 0.0291872295);
  assert.match(output.recommendation_markdown, /\| Recommended model \| \*\*gpt-5\.6-luna\*\* \|/);
  assert.match(output.recommendation_markdown, /## Cost by model/);
  assert.match(output.recommendation_markdown, /\| Model \| Measured cost \|/);
  assert.match(output.recommendation_markdown, /\| \*\*Total\*\* \|/);
  assert.deepEqual(output.skipped_models, ["gpt-5.6-sol"]);
});

test("runs once, persists the terminal result, and replays it", async () => {
  const store = createMemoryStore();
  let calls = 0;
  const handler = createHandler({
    verifyBearer: async () => {},
    getOperationStore: () => store,
    execute: async () => {
      calls += 1;
      return report;
    },
  });
  const event = {
    httpMethod: "POST",
    headers: { authorization: "Bearer accepted", "idempotency-key": "same-key" },
    body: JSON.stringify({ repository }),
  };
  const first = await handler(event);
  const replay = await handler(event);
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(jsonBody(first).replayed, false);
  assert.equal(jsonBody(replay).replayed, true);
  assert.equal(jsonBody(first).provider_operation_id, jsonBody(replay).provider_operation_id);
  assert.deepEqual(jsonBody(first).output, jsonBody(replay).output);
  assert.equal(calls, 1);
});

test("same key with a different fingerprint is a conflict", async () => {
  const store = createMemoryStore();
  const handler = createHandler({
    verifyBearer: async () => {},
    getOperationStore: () => store,
    execute: async () => report,
  });
  const base = {
    httpMethod: "POST",
    headers: { authorization: "Bearer accepted", "idempotency-key": "conflict-key" },
  };
  await handler({ ...base, body: JSON.stringify({ repository }) });
  const conflict = await handler({
    ...base,
    body: JSON.stringify({ repository, unexpected: true }),
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(jsonBody(conflict).error.code, "idempotency_conflict");
});

test("a concurrent duplicate receives pending without repeating work", async () => {
  const store = createMemoryStore();
  let resolve;
  let calls = 0;
  const gate = new Promise((done) => { resolve = done; });
  const handler = createHandler({
    verifyBearer: async () => {},
    getOperationStore: () => store,
    execute: async () => {
      calls += 1;
      await gate;
      return report;
    },
  });
  const event = {
    httpMethod: "POST",
    headers: { authorization: "Bearer accepted", "idempotency-key": "parallel-key" },
    body: JSON.stringify({ repository }),
  };
  const firstPromise = handler(event);
  await new Promise((done) => setImmediate(done));
  const duplicate = await handler(event);
  assert.equal(duplicate.statusCode, 202);
  assert.equal(jsonBody(duplicate).replayed, true);
  assert.equal(calls, 1);
  resolve();
  const first = await firstPromise;
  assert.equal(first.statusCode, 200);

  const status = await handler({
    httpMethod: "GET",
    headers: { authorization: "Bearer accepted" },
    queryStringParameters: {
      provider_operation_id: providerOperationId("parallel-key"),
    },
  });
  assert.equal(status.statusCode, 200);
  assert.equal(Object.hasOwn(jsonBody(status), "replayed"), false);
});

test("rejects unsigned requests before touching storage", async () => {
  let storeReads = 0;
  const handler = createHandler({
    getOperationStore: () => {
      storeReads += 1;
      return createMemoryStore();
    },
  });
  const response = await handler({
    httpMethod: "POST",
    headers: { "idempotency-key": "unsigned" },
    body: JSON.stringify({ repository }),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(storeReads, 0);
});

test("generated manifest embeds the exact schemas and safe example", async () => {
  const [manifestRaw, inputSchema, outputSchema, example] = await Promise.all([
    fs.readFile(new URL("../public/.well-known/ginse.json", import.meta.url), "utf8"),
    fs.readFile(new URL("../ginse/input.schema.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../ginse/output.schema.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../ginse/example-input.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const manifest = JSON.parse(manifestRaw);
  assert.equal(
    createHash("sha256").update(manifestRaw).digest("hex"),
    "58e4c9344f0a2664963e886f9052ab6701c254decb079068cb46e43e0355e6c8",
  );
  assert.equal(manifest.run_url, "https://lead-router-ascii-box.netlify.app/run");
  assert.deepEqual(manifest.input_schema, inputSchema);
  assert.deepEqual(manifest.output_schema, outputSchema);
  assert.deepEqual(manifest.example, { input: example });
  assert.ok(manifest.ownership_token.length >= 16);
});
