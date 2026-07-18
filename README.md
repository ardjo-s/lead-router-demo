# Lead Router

One-page Netlify demo that evaluates the immutable
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
browser. The app fetches only seven declared static files from the hard-
allowlisted public benchmark repository and never executes repository code.

## HTTP contract

```bash
curl -X POST https://YOUR-SITE.netlify.app/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"repository":"https://github.com/ardjo-s/ascii-box-lead-workflow","ref":"main","run_label":"codex-smoke"}'
```

The response contains workflow identity, recommendation, ranking, skipped
models, failed models, and limitations. Codex can call it only when an
HTTP-capable tool is available; this is not a native Codex tool.

## Verified boundary

The deterministic evaluator and local contract tests are included. Ginse AI
integration is not publicly documented or verified, so this repository makes
no Ginse-to-Codex claim. A deployment and live model comparison must be
recorded before claiming Netlify or model integration.
