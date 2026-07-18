export const ALLOWED_REPOSITORY = "https://github.com/ardjo-s/ascii-box-lead-workflow";
export const DEFAULT_REF = "main";
export const MAX_FILE_BYTES = 250_000;
export const MODEL_TIMEOUT_MS = 90_000;
export const REQUIRED_PATHS = ["workflow/benchmark.json","workflow/prompt.md","workflow/cases.json","workflow/ground-truth.json","workflow/output.schema.json","config/models.json","config/model-pricing.json"];
export const LIMITATIONS = [
  "Five synthetic labeled cases; recommendation confidence is demo-low.",
  "Evaluates frozen lead qualification, not live discovery or scraping.",
  "Runs one trial per configured, accessible, compatible model.",
  "Pricing is a dated benchmark snapshot, not automatic live pricing.",
  "Ginse-to-Codex and native Codex tool integration are unverified."
];
