# Lead Router

Conversational Ginse action backed by the existing Netlify evaluator. It
evaluates the immutable
[ASCII Box lead workflow](https://github.com/ardjo-s/ascii-box-lead-workflow)
across all configured, accessible, compatible OpenAI models.

## Run locally

Requires Node.js 20+.

```bash
npm test
npm run check
npx netlify dev
```

Set `OPENROUTER_API_KEY` in the Netlify server environment. The backend maps
the fixed candidates to their `openai/` OpenRouter IDs; `OPENAI_API_KEY` remains
an optional direct-provider fallback. Credentials are never sent to the browser.
The app fetches the benchmark manifest, then only its declared static
workflow/config files and public-source ledger from the hard-allowlisted public
repository. It never executes repository code or hardcodes the benchmark case
count.

## HTTP contract

```bash
curl -X POST https://YOUR-SITE.netlify.app/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"repository":"https://github.com/ardjo-s/ascii-box-lead-workflow","ref":"main","run_label":"codex-smoke"}'
```

The internal response preserves workflow identity, ranking, skips, failures,
cost, latency, and limitations as evidence. `recommendation_text` is the concise
answer intended for the Ginse conversation.

## Ginse action

The marketplace invokes `POST /run` with a short-lived Ed25519 bearer token and
an `Idempotency-Key`. The adapter verifies the token against Ginse's public
JWKS, claims the key atomically in site-wide Netlify Blobs, and returns the same
stored result and stable `provider_operation_id` on replay. No Ginse or builder
secret is stored in the repository.

The published output contains `recommendation_markdown`, a stable result table
with the recommended model, quality, latency, confidence, total and per-model
measured cost, tested/skipped/failed coverage, reason, and limitations.

The deployed `/methodology` page documents the frozen benchmark, deterministic
scoring formulas, eligibility gate, observed cost and latency, and the model and
provider variability that remains outside the scorer.

## Verified boundary

The deterministic evaluator and local contract tests are included. The Ginse
listing, signed invocation, and replay contract may be claimed only after the
public manifest passes Ginse verification and the listing is published.
