# Lead Router

Conversational Ginse action backed by one Netlify function. It evaluates the
immutable
[ASCII Box lead workflow](https://github.com/ardjo-s/ascii-box-lead-workflow)
across all configured, accessible, compatible OpenAI models.

## Run locally

Requires Node.js 20+.

```bash
npm test
npm run check
npx netlify dev
```

Set `OPENAI_API_KEY` in the Netlify server environment. It is never sent to the
browser. The app fetches the benchmark manifest, then only its declared static
workflow/config files from the hard-allowlisted public repository. It never
executes repository code or hardcodes the benchmark case count.

## HTTP contract

```bash
curl -X POST https://YOUR-SITE.netlify.app/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"repository":"https://github.com/ardjo-s/ascii-box-lead-workflow","ref":"main","run_label":"codex-smoke"}'
```

The internal response preserves workflow identity, ranking, skips, failures,
cost, latency, and limitations as evidence. `recommendation_text` is the concise
answer intended for the Ginse conversation.

## Verified boundary

The deterministic evaluator and local contract tests are included. Ginse AI
integration is not publicly documented or verified, so this repository makes
no Ginse-to-Codex claim. A deployment and live model comparison must be
recorded before claiming Netlify or model integration.
