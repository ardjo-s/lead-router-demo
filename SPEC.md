# Lead Router demo specification

Status: `ready-for-agent`

## Authoritative MVP override

The final user-facing output is one textual recommendation in the Ginse
conversation. It includes the winner, measured quality, estimated cost,
measured latency, tested/skipped/failed coverage, and limitations. Ranking JSON
remains internal evidence. No dashboard, chart, ranking table, or copy-JSON UI
is required.

The benchmark contains five frozen, dated cases built from real public
professional evidence. It contains no private contact data and does not claim
purchase intent.

## Problem Statement

The CEO of ASCII Box repeatedly uses Codex to research enterprise leads but has
to choose an OpenAI model manually. Model availability changes, and generic
benchmarks do not reveal which accessible model performs best on his specific
lead-qualification workflow. He needs a small, demonstrable agent that runs the
same workflow across compatible OpenAI models and returns an evidence-backed
recommendation based on measured quality, cost, and latency.

The implementation must be shippable in one hour. It must use the separate,
versioned ASCII Box lead workflow as benchmark input, run on Netlify, and be
buildable from a Ginse AI conversation. It must not turn into a production
scraper or a general evaluation platform.

## Solution

Build a conversational action called Lead Router with one server-side
evaluation endpoint. The user supplies the ASCII Box workflow repository URL.
The server reads only the declared static benchmark files, runs the exact same
prompt and five labeled cases through every configured, accessible, compatible
OpenAI model, scores outputs deterministically, measures latency and token
usage, estimates cost from dated pricing, and recommends the best eligible
model.

The Ginse conversation shows the textual recommendation. The backend also
returns a structured ranking, failures, skips, and limitations as internal
evidence. Ginse-to-Codex integration is a separate proof gate: it may be
claimed only when a real invocation is shown.

The single highest testing seam is the external evaluation contract:
repository URL in, complete evaluation report out. This directly matches the
confirmed Input → Operation → Output requirement.

## User Stories

1. As the ASCII Box CEO, I want to provide a workflow repository URL, so that
   the agent evaluates my real workflow contract rather than a generic prompt.
2. As the ASCII Box CEO, I want to start the comparison with one action, so that
   I do not manually select or run models.
3. As the ASCII Box CEO, I want every model to receive identical prompt and
   evidence, so that the comparison is fair.
4. As the ASCII Box CEO, I want the benchmark to reject companies outside the
   500–5,000 employee target, so that the recommendation reflects my ICP.
5. As the ASCII Box CEO, I want the benchmark to identify technical champions,
   economic buyers, and procurement gatekeepers, so that it reflects the full
   buying committee.
6. As the ASCII Box CEO, I want quality measured against labeled ground truth,
   so that “accuracy” is not the model's self-reported confidence.
7. As the ASCII Box CEO, I want evidence quotes checked against supplied source
   text, so that hallucinated support lowers the score.
8. As the ASCII Box CEO, I want role precision and recall included, so that
   models are penalized for both missed buyers and irrelevant people.
9. As the ASCII Box CEO, I want latency measured for each actual API call, so
   that speed is based on the workflow rather than marketing claims.
10. As the ASCII Box CEO, I want token usage captured from the provider
    response, so that cost can be reconstructed.
11. As the ASCII Box CEO, I want cost estimated from dated official rates, so
    that stale or invented pricing cannot determine the winner.
12. As the ASCII Box CEO, I want quality to dominate the composite score, so
    that a cheap but inaccurate model cannot win.
13. As the ASCII Box CEO, I want a minimum quality gate, so that the application
    refuses to recommend an unusable model.
14. As the ASCII Box CEO, I want one recommended model with a plain-language
    reason, so that I can act without reading raw traces.
15. As the ASCII Box CEO, I want the text to summarize the measured tradeoff,
    so that I can act without opening a dashboard.
16. As the ASCII Box CEO, I want inaccessible models shown as skipped with a
    reason, so that the report never overstates coverage.
17. As the ASCII Box CEO, I want failed models isolated, so that one API error
    does not destroy the entire comparison.
18. As the ASCII Box CEO, I want the report to distinguish completed, skipped,
    and failed models, so that “all models” has an auditable meaning.
19. As the builder, I want the raw JSON retained internally, so that the
    recommendation remains auditable.
20. As the ASCII Box CEO, I want limitations in the conversation text, so that
    a five-case demo is not mistaken for production proof.
21. As a demo viewer, I want to provide one repository URL and receive one
    answer, so that the product needs no UI explanation.
22. As a demo viewer, I want quality, cost, and latency in the same concise
    response, so that the recommendation is immediately legible.
23. As a builder, I want one server function and no database, so that the demo
    can ship within the hour.
24. As a builder, I want a fixed candidate manifest, so that model drift cannot
    silently change a recorded run.
25. As a builder, I want the candidate manifest intersected with project access,
    so that unavailable models produce a useful skip instead of a crash.
26. As a builder, I want strict structured model output, so that deterministic
    scoring does not depend on prose parsing.
27. As a builder, I want the scorer to match the reference benchmark scorer, so
    that the demo and source repository agree.
28. As a builder, I want repository files fetched as data only, so that an
    arbitrary GitHub repository cannot execute code on the server.
29. As a builder, I want the provider key stored only on Netlify's server side,
    so that it is never exposed to the browser.
30. As a builder, I want bounded files, requests, and model timeouts, so that one
    malformed input cannot consume the entire function budget.
31. As a builder, I want errors sanitized, so that credentials and provider
    internals do not leak in the response.
32. As a builder, I want a local perfect-output check, so that the scoring path
    is proven before spending API credits.
33. As a builder, I want one deployed end-to-end smoke run, so that completion
    means a working product rather than generated source files.
34. As a Codex user, I want a documented HTTP invocation, so that Codex can call
    the evaluator when an HTTP-capable tool is available.
35. As a Codex user, I want native integration claims withheld until tested, so
    that a Netlify endpoint is not misrepresented as an installed Codex tool.
36. As a future product owner, I want live discovery kept separate from frozen
    qualification, so that later scraping evaluation does not corrupt the
    reproducible benchmark.

## Implementation Decisions

- Build one conversational Ginse action backed by one Netlify server function.
- Keep one external product seam: an evaluation request returns a complete
  evaluation report. Internal modules may support this seam but do not create
  additional public endpoints for the MVP.
- Accept a public GitHub repository URL, ref, and optional run label. Hard
  allowlist the source repository in the demo.
- Read only the workflow manifest and the static files it declares. Never clone
  or execute repository content.
- Prefer OpenRouter chat completions with `OPENROUTER_API_KEY`, mapping the
  candidates to their `openai/` routes. Keep the direct OpenAI Responses API
  with `OPENAI_API_KEY` as an optional fallback.
- Supply the identical developer prompt, complete five-case input, reasoning
  effort, and strict JSON schema to every candidate.
- Use the configured GPT-5.6 Sol, Terra, and Luna candidates at medium reasoning
  effort. Intersect them with models accessible to the API project.
- Run one batch request per model. Preserve per-call status, duration, usage,
  and sanitized error details.
- Port the deterministic reference scorer. Do not use an LLM judge.
- Define quality as 70% role F1, 20% exact evidence support, and 10% company-fit
  accuracy.
- Compute estimated cost from uncached input, cached input, and output tokens
  using the dated pricing snapshot. Missing pricing makes a model ineligible.
- Normalize cost and latency against the best successful value in the current
  run.
- Define the recommendation score as 65% quality, 20% cost efficiency, and 15%
  latency efficiency.
- Require valid structured output, quality of at least 0.75, known price, and
  measured latency and usage before a model can be recommended.
- Break ties by quality, then lower cost, then lower latency.
- Return a report containing workflow identity, recommendation, ranking,
  skipped models, failed models, and limitations.
- Mark recommendation confidence `demo-low`.
- Store the provider credential only in Netlify server environment variables.
- Use no database, authentication, queue, background worker, analytics, or
  general design system.
- Build from the Ginse AI conversation when that surface works. If its
  integration is blocked or undocumented after ten minutes, finish the
  Netlify application directly and record the unverified Ginse boundary.
- Do not claim that every OpenAI model was evaluated. Say “all configured,
  accessible, compatible models.”

## Testing Decisions

- Test external behavior through the single evaluation seam. Given the
  allowlisted workflow and controlled provider responses, assert the complete
  ranking and recommendation report.
- Test the perfect benchmark output through the reference scorer and require a
  quality score of exactly 1 after output normalization.
- Test one deliberately incomplete output and require lower recall and quality.
- Test one distractor-heavy output and require lower precision.
- Test one fabricated evidence quote and require lower evidence exactness.
- Test the out-of-band company and require no selected leads.
- Test an inaccessible candidate and require a visible skipped-model entry.
- Test a provider error and require a visible failed-model entry while other
  models still complete.
- Test missing pricing and require the model to be ineligible.
- Test an unallowlisted repository and require rejection before any model call.
- Test malformed or oversized workflow data and require a bounded client error.
- Test that browser responses and logs never contain provider keys.
- Finish with one live deployed smoke: start a comparison, complete at least two
  models, return the same winner in `recommendation_text` and the internal
  ranking, and preserve the raw report.
- Prefer contract-level tests over tests of framework components or internal
  function calls.

## Out of Scope

- Live web scraping, browser automation, search, or source enrichment
- LinkedIn scraping, email discovery, phone discovery, or outreach
- Private GitHub repository authentication
- Automatic model pricing discovery
- Every OpenAI modality, historical model, or research preview
- Multiple trials or statistical confidence intervals
- Persistent run history, accounts, teams, billing, or multi-tenancy
- Background queues, distributed workers, or long-running orchestration
- A remote MCP server, marketplace plugin, OAuth connector, or native Codex
  installation
- Production procurement or campaign decisions
- Changes to the source workflow repository

## Further Notes

- Immutable benchmark context:
  `https://github.com/ardjo-s/ascii-box-lead-workflow`
- Local benchmark fallback:
  `/Users/ardjo/CODE/repos/ascii-box-lead-workflow`
- Product target: [ASCII Box](https://box.ascii.dev/), persistent Ubuntu
  machines for isolated agent workloads, Docker, SSH, snapshots, and parallel
  agent execution.
- The demo repository and workflow repository must remain separate.
- The build is timeboxed to 60 minutes:
  - 0–10: scaffold and load benchmark
  - 10–25: OpenRouter/OpenAI model calls
  - 25–35: scoring, cost, ranking
  - 35–45: concise conversational result
  - 45–55: Netlify deployment
  - 55–60: live smoke and evidence capture
- If behind schedule, hardcode the allowlisted workflow URL and candidate set.
  Never remove scoring, metrics, failure visibility, or the live smoke.
- Ginse AI has not been publicly documented or verified in this preparation.
  The implementation must report the actual verified integration boundary.
