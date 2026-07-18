# Repository instructions

## Mission

Ship the Lead Router demo from `SPEC.md` as the smallest working end-to-end
application.

## Priorities

1. One real evaluation run.
2. Deterministic quality scoring.
3. Measured model cost and latency.
4. Visible failures and limitations.
5. Netlify deployment.

## Constraints

- All GitHub-visible text is English.
- Use the separate `ascii-box-lead-workflow` repository as immutable benchmark
  input.
- Do not change the source benchmark, fixtures, ground truth, model IDs, or
  scoring weights.
- Prefer OpenRouter's OpenAI-model routes with `OPENROUTER_API_KEY`; keep the
  direct OpenAI Responses API as an optional server-side fallback.
- Never execute code fetched from a repository.
- No live scraping, personal contact data, auth, database, queue, or unrelated
  framework work in the MVP.
- Do not claim Ginse, Codex, model, or Netlify integration unless verified.
- Preserve one external product seam: repository URL in, evaluation report out.
- Stop at the first verified end-to-end implementation.
