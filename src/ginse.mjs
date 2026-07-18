import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../ginse/input.schema.json" with { type: "json" };
import outputSchema from "../ginse/output.schema.json" with { type: "json" };

export const GINSE_APP_ID = "1a5d61ec-fab8-4a1e-bd93-1f7ab7ac0e9c";
export const GINSE_ISSUER = "https://api.ginse.ai";
export const GINSE_JWKS_URL = `${GINSE_ISSUER}/.well-known/jwks.json`;
export const GINSE_RUN_URL = "https://lead-router-ascii-box.netlify.app/run";
export const GINSE_AUDIENCE = new URL(GINSE_RUN_URL).origin;
export const GINSE_STATUS_URL = `${GINSE_RUN_URL}/status`;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateInputSchema = ajv.compile(inputSchema);
const validateOutputSchema = ajv.compile(outputSchema);
const SAFE_KEY = /^[A-Za-z0-9._:-]{1,200}$/;
const SAFE_OPERATION_ID = /^lr_[a-f0-9]{64}$/;
const CLOCK_SKEW_SECONDS = 30;
const JWKS_TTL_MS = 5 * 60_000;
let jwksCache = null;

export class GinseRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const decodeBase64Url = (value) => Buffer.from(value, "base64url");

const parseJsonSegment = (value, label) => {
  try {
    const decoded = decodeBase64Url(value);
    if (decoded.byteLength === 0 || decoded.byteLength > 8_192) throw new Error();
    return JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new GinseRequestError(401, "invalid_token", `Invalid Ginse token ${label}.`);
  }
};

const audienceMatches = (audience) => {
  const values = Array.isArray(audience) ? audience : [audience];
  return values.includes(GINSE_AUDIENCE);
};

async function loadJwks(fetchImpl, now, force = false) {
  if (!force && jwksCache && now() - jwksCache.loadedAt < JWKS_TTL_MS) {
    return jwksCache.body;
  }
  const response = await fetchImpl(GINSE_JWKS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new GinseRequestError(503, "auth_unavailable", "Ginse token verification is unavailable.");
  }
  const body = await response.json();
  if (!Array.isArray(body?.keys)) {
    throw new GinseRequestError(503, "auth_unavailable", "Ginse token verification is unavailable.");
  }
  jwksCache = { body, loadedAt: now() };
  return body;
}

export async function verifyGinseBearer(
  authorization,
  { fetchImpl = fetch, now = Date.now, jwks = null } = {},
) {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
    String(authorization || ""),
  );
  if (!match) {
    throw new GinseRequestError(401, "missing_token", "A Ginse bearer token is required.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = match[1].split(".");
  const header = parseJsonSegment(encodedHeader, "header");
  const payload = parseJsonSegment(encodedPayload, "payload");
  if (header.alg !== "EdDSA" || typeof header.kid !== "string") {
    throw new GinseRequestError(401, "invalid_token", "Invalid Ginse token algorithm.");
  }

  let keySet = jwks || await loadJwks(fetchImpl, now);
  let jwk = keySet.keys?.find((item) => item.kid === header.kid);
  if (!jwk && !jwks) {
    keySet = await loadJwks(fetchImpl, now, true);
    jwk = keySet.keys?.find((item) => item.kid === header.kid);
  }
  if (
    !jwk
    || jwk.kty !== "OKP"
    || jwk.crv !== "Ed25519"
    || jwk.alg !== "EdDSA"
    || jwk.use !== "sig"
  ) {
    throw new GinseRequestError(401, "invalid_token", "Invalid Ginse signing key.");
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new GinseRequestError(503, "auth_unavailable", "Ginse token verification is unavailable.");
  }
  const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  if (!verifySignature(null, signed, publicKey, signature)) {
    throw new GinseRequestError(401, "invalid_token", "Invalid Ginse token signature.");
  }

  const currentSeconds = Math.floor(now() / 1_000);
  if (
    payload.iss !== GINSE_ISSUER
    || !audienceMatches(payload.aud)
    || payload.sub !== GINSE_APP_ID
    || !Number.isFinite(payload.exp)
    || payload.exp < currentSeconds - CLOCK_SKEW_SECONDS
    || (Number.isFinite(payload.nbf) && payload.nbf > currentSeconds + CLOCK_SKEW_SECONDS)
    || (Number.isFinite(payload.iat) && payload.iat > currentSeconds + CLOCK_SKEW_SECONDS)
  ) {
    throw new GinseRequestError(401, "invalid_token", "Invalid Ginse token claims.");
  }
  return payload;
}

export function validateGinseInput(input) {
  if (!validateInputSchema(input)) {
    throw new GinseRequestError(400, "invalid_input", "Input does not match the Ginse contract.");
  }
  return { repository: input.repository, ref: "main" };
}

export function validateGinseOutput(output) {
  if (!validateOutputSchema(output)) {
    throw new GinseRequestError(502, "invalid_output", "Evaluation output does not match the Ginse contract.");
  }
  return output;
}

export function requestFingerprint(input) {
  const sort = (value) => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(sort(input))).digest("hex");
}

export function providerOperationId(idempotencyKey) {
  if (!SAFE_KEY.test(String(idempotencyKey || ""))) {
    throw new GinseRequestError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must contain 1-200 safe characters.",
    );
  }
  return `lr_${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

export function validateOperationId(value) {
  if (!SAFE_OPERATION_ID.test(String(value || ""))) {
    throw new GinseRequestError(400, "invalid_operation_id", "Invalid provider operation ID.");
  }
  return value;
}

export function createBlobOperationStore(
  event,
  getStoreImpl = getStore,
  connectLambdaImpl = connectLambda,
) {
  connectLambdaImpl(event);
  const store = getStoreImpl({ name: "ginse-lead-router-runs", consistency: "strong" });
  const key = (operationId) => `runs/${operationId}`;
  return {
    async claim(operationId, record) {
      return store.setJSON(key(operationId), record, { onlyIfNew: true });
    },
    async get(operationId) {
      return store.get(key(operationId), { consistency: "strong", type: "json" });
    },
    async finish(operationId, record, etag) {
      const result = await store.setJSON(key(operationId), record, { onlyIfMatch: etag });
      if (!result.modified) throw new Error("The operation record changed before completion.");
      return result;
    },
  };
}

const finiteOrNull = (value) => Number.isFinite(value) ? value : null;
const decimal = (value, places = 12) => Number(value).toFixed(places).replace(/0+$/, "").replace(/\.$/, "");
const cost = (value) => Number.isFinite(value) ? `$${decimal(value)}` : "—";
const latency = (value) => Number.isFinite(value) ? `${(value / 1_000).toFixed(3)} s` : "—";
const escapeCell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

function recommendationMarkdown(output, reason) {
  const model = output.recommended_model || "No eligible model";
  const lines = [
    "# Result",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Recommended model | **${escapeCell(model)}** |`,
    `| Quality | ${Number.isFinite(output.quality) ? output.quality.toFixed(3) : "—"} |`,
    `| Latency | ${latency(output.latency_ms)} |`,
    "| Confidence | Low — demo |",
    `| Total measured cost | **$${decimal(output.measured_total_cost_usd)}** |`,
    `| Rounded total | **≈ $${output.measured_total_cost_usd.toFixed(5)}** |`,
    "",
    "## Cost by model",
    "",
    "| Model | Measured cost |",
    "| --- | ---: |",
    ...output.models.map((item) => (
      `| ${escapeCell(item.model)} | ${cost(item.measured_cost_usd)} |`
    )),
    `| **Total** | **$${decimal(output.measured_total_cost_usd)}** |`,
    "",
    "## Why",
    "",
    reason || "No model met the deterministic recommendation gate.",
    "",
    "## Coverage and limits",
    "",
    `Tested: ${output.tested_models.join(", ") || "none"}.`,
    `Failed: ${output.failed_models.join(", ") || "none"}.`,
    `Skipped: ${output.skipped_models.join(", ") || "none"}.`,
    ...output.limitations.map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

export function actionOutputFromReport(report) {
  const completed = report.ranking.map((item) => ({
    model: item.model,
    status: "completed",
    quality: finiteOrNull(item.score?.quality_score),
    role_f1: finiteOrNull(item.score?.role_f1),
    evidence_exactness: finiteOrNull(item.score?.evidence_exactness),
    company_fit_accuracy: finiteOrNull(item.score?.company_fit_accuracy),
    measured_cost_usd: finiteOrNull(item.measured_provider_cost_usd),
    latency_ms: finiteOrNull(item.latency_ms),
    reason: item.eligible ? null : item.ineligible_reasons.join(", ") || null,
  }));
  const skipped = report.skipped_models.map((item) => ({
    model: item.model,
    status: "skipped",
    quality: null,
    role_f1: null,
    evidence_exactness: null,
    company_fit_accuracy: null,
    measured_cost_usd: null,
    latency_ms: null,
    reason: item.reason,
  }));
  const failed = report.failed_models.map((item) => ({
    model: item.model,
    status: "failed",
    quality: null,
    role_f1: null,
    evidence_exactness: null,
    company_fit_accuracy: null,
    measured_cost_usd: null,
    latency_ms: finiteOrNull(item.latency_ms),
    reason: item.error,
  }));
  const winner = report.recommendation
    ? report.ranking.find((item) => item.model === report.recommendation.model)
    : null;
  const models = [...completed, ...skipped, ...failed];
  const output = {
    recommendation_markdown: "",
    recommended_model: report.recommendation?.model || null,
    quality: finiteOrNull(winner?.score?.quality_score),
    latency_ms: finiteOrNull(winner?.latency_ms),
    confidence: "demo-low",
    measured_total_cost_usd: Number(completed
      .reduce((sum, item) => sum + (item.measured_cost_usd || 0), 0)
      .toFixed(12)),
    models,
    tested_models: completed.map((item) => item.model),
    skipped_models: skipped.map((item) => item.model),
    failed_models: failed.map((item) => item.model),
    limitations: report.limitations,
  };
  output.recommendation_markdown = recommendationMarkdown(output, report.recommendation?.reason);
  return validateGinseOutput(output);
}

export function statusUrl(operationId) {
  return `${GINSE_STATUS_URL}?provider_operation_id=${encodeURIComponent(operationId)}`;
}
