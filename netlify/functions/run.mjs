import {
  actionOutputFromReport,
  createBlobOperationStore,
  GinseRequestError,
  providerOperationId,
  requestFingerprint,
  statusUrl,
  validateGinseInput,
  validateOperationId,
  verifyGinseBearer,
} from "../../src/ginse.mjs";
import { ConfigurationError, executeEvaluation } from "../../src/evaluation-service.mjs";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const authorization = (event) => event.headers?.authorization || event.headers?.Authorization;

const responseForRecord = (record, replayed, includeReplay = true) => {
  if (record.status === "succeeded") {
    return json(200, {
      status: "succeeded",
      provider_operation_id: record.provider_operation_id,
      ...(includeReplay ? { replayed } : {}),
      output: record.output,
    });
  }
  if (record.status === "failed") {
    return json(502, {
      status: "failed",
      provider_operation_id: record.provider_operation_id,
      ...(includeReplay ? { replayed } : {}),
      error: record.error,
    });
  }
  return json(202, {
    status: "pending",
    provider_operation_id: record.provider_operation_id,
    ...(includeReplay ? { replayed } : {}),
    status_url: statusUrl(record.provider_operation_id),
  });
};

export function createHandler({
  verifyBearer = verifyGinseBearer,
  getOperationStore = createBlobOperationStore,
  execute = executeEvaluation,
} = {}) {
  return async function handler(event) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
    try {
      await verifyBearer(authorization(event));
      const store = getOperationStore(event);

      if (event.httpMethod === "GET") {
        const operationId = validateOperationId(
          event.queryStringParameters?.provider_operation_id,
        );
        const record = await store.get(operationId);
        if (!record) throw new GinseRequestError(404, "operation_not_found", "Operation not found.");
        return responseForRecord(record, false, false);
      }

      if (event.httpMethod !== "POST") {
        throw new GinseRequestError(405, "method_not_allowed", "Method not allowed.");
      }

      let rawInput;
      try {
        rawInput = JSON.parse(event.body || "{}");
      } catch {
        throw new GinseRequestError(400, "malformed_json", "Malformed JSON body.");
      }
      const actionInput = rawInput?.input ?? rawInput;
      const operationId = providerOperationId(
        event.headers?.["idempotency-key"] || event.headers?.["Idempotency-Key"],
      );
      const fingerprint = requestFingerprint(actionInput);
      const existing = await store.get(operationId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new GinseRequestError(
            409,
            "idempotency_conflict",
            "Idempotency-Key was already used with different input.",
          );
        }
        return responseForRecord(existing, true);
      }
      const input = validateGinseInput(actionInput);
      const initial = {
        provider_operation_id: operationId,
        fingerprint,
        status: "running",
        created_at: new Date().toISOString(),
      };
      const claim = await store.claim(operationId, initial);

      if (!claim.modified) {
        const claimed = await store.get(operationId);
        if (!claimed) throw new Error("Claimed operation could not be read.");
        if (claimed.fingerprint !== fingerprint) {
          throw new GinseRequestError(
            409,
            "idempotency_conflict",
            "Idempotency-Key was already used with different input.",
          );
        }
        return responseForRecord(claimed, true);
      }

      try {
        const report = await execute(input);
        const terminal = {
          ...initial,
          status: "succeeded",
          completed_at: new Date().toISOString(),
          output: actionOutputFromReport(report),
        };
        await store.finish(operationId, terminal, claim.etag);
        return responseForRecord(terminal, false);
      } catch (error) {
        const publicError = error instanceof ConfigurationError
          ? { code: "not_configured", message: error.message }
          : { code: "evaluation_failed", message: "Evaluation failed." };
        const terminal = {
          ...initial,
          status: "failed",
          completed_at: new Date().toISOString(),
          error: publicError,
        };
        await store.finish(operationId, terminal, claim.etag);
        return responseForRecord(terminal, false);
      }
    } catch (error) {
      if (error instanceof GinseRequestError) {
        return json(error.status, { error: { code: error.code, message: error.message } });
      }
      console.error("Ginse run infrastructure error", JSON.stringify({
        name: error?.name || null,
        code: error?.code || null,
        status: error?.status || null,
        message: String(error?.message || "").slice(0, 300),
      }));
      return json(503, {
        error: { code: "service_unavailable", message: "Ginse action is unavailable." },
      });
    }
  };
}

const webHandler = createHandler();

export default async function run(request) {
  const url = new URL(request.url);
  const result = await webHandler({
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: request.method === "GET" || request.method === "HEAD" ? null : await request.text(),
  });
  return new Response(result.statusCode === 204 ? null : result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
