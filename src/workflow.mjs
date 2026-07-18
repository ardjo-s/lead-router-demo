import { ALLOWED_REPOSITORY, DEFAULT_REF, MAX_FILE_BYTES } from "./constants.mjs";

export class ClientError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const normalizeRepository = (value) => String(value || "").trim().replace(/\/+$/, "").replace(/\.git$/, "");
export function validateRequest(input = {}) {
  const repository = normalizeRepository(input.repository);
  if (repository !== ALLOWED_REPOSITORY) throw new ClientError("Repository is not allowlisted.");
  const ref = String(input.ref || DEFAULT_REF);
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(ref) || ref.includes("..")) throw new ClientError("Invalid ref.");
  return { repository, ref, runLabel: String(input.run_label || "").slice(0, 80) };
}
async function readBounded(response, path) {
  if (!response.ok) throw new ClientError(`Workflow file unavailable: ${path}.`, 422);
  if (Number(response.headers.get("content-length") || 0) > MAX_FILE_BYTES) throw new ClientError(`Workflow file too large: ${path}.`, 413);
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new ClientError(`Workflow file too large: ${path}.`, 413);
  return text;
}
export async function fetchWorkflow({ ref }, fetchImpl = fetch) {
  const files = {};
  const fetchPath = async (path) => {
    if (!/^(workflow|config)\/[A-Za-z0-9._/-]+$/.test(path) || path.includes("..")) {
      throw new ClientError(`Unsafe workflow path: ${path}.`, 422);
    }
    const url = `https://raw.githubusercontent.com/ardjo-s/ascii-box-lead-workflow/${encodeURIComponent(ref)}/${path}`;
    files[path] = await readBounded(await fetchImpl(url, { headers: { "user-agent": "lead-router-demo/1.0" }, signal: AbortSignal.timeout(10_000) }), path);
  };
  const json = (path) => {
    try { return JSON.parse(files[path]); }
    catch { throw new ClientError(`Malformed workflow JSON: ${path}.`, 422); }
  };
  await fetchPath("workflow/benchmark.json");
  const benchmark = json("workflow/benchmark.json");
  const declared = [
    benchmark.prompt_path,
    benchmark.cases_path,
    benchmark.ground_truth_path,
    benchmark.output_schema_path,
    benchmark.model_config_path,
    benchmark.pricing_path,
  ];
  if (declared.some((path) => typeof path !== "string") || new Set(declared).size !== declared.length) {
    throw new ClientError("Workflow manifest is incomplete or ambiguous.", 422);
  }
  for (const path of declared) await fetchPath(path);
  const workflow = {
    benchmark,
    prompt: files[benchmark.prompt_path],
    cases: json(benchmark.cases_path),
    truth: json(benchmark.ground_truth_path),
    schema: json(benchmark.output_schema_path),
    models: json(benchmark.model_config_path),
    pricing: json(benchmark.pricing_path),
  };
  if (!Array.isArray(workflow.cases.cases) || workflow.cases.cases.length === 0) {
    throw new ClientError("Workflow contains no benchmark cases.", 422);
  }
  return workflow;
}
