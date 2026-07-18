import { ALLOWED_REPOSITORY, DEFAULT_REF, MAX_FILE_BYTES, REQUIRED_PATHS } from "./constants.mjs";

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
  for (const path of REQUIRED_PATHS) {
    const url = `https://raw.githubusercontent.com/ardjo-s/ascii-box-lead-workflow/${encodeURIComponent(ref)}/${path}`;
    files[path] = await readBounded(await fetchImpl(url, { headers: { "user-agent": "lead-router-demo/1.0" }, signal: AbortSignal.timeout(10_000) }), path);
  }
  const json = (path) => {
    try { return JSON.parse(files[path]); }
    catch { throw new ClientError(`Malformed workflow JSON: ${path}.`, 422); }
  };
  const workflow = {
    benchmark: json("workflow/benchmark.json"), prompt: files["workflow/prompt.md"],
    cases: json("workflow/cases.json"), truth: json("workflow/ground-truth.json"),
    schema: json("workflow/output.schema.json"), models: json("config/models.json"),
    pricing: json("config/model-pricing.json")
  };
  if (workflow.benchmark.prompt_path !== "workflow/prompt.md" || workflow.benchmark.cases_path !== "workflow/cases.json" || workflow.benchmark.ground_truth_path !== "workflow/ground-truth.json" || workflow.cases.cases?.length !== 5) {
    throw new ClientError("Workflow manifest does not match the demo contract.", 422);
  }
  return workflow;
}
