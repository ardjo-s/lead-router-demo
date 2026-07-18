import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readPublic = (name) => readFile(new URL(`../public/${name}`, import.meta.url), "utf8");

test("landing page links to the evaluation methodology", async () => {
  const [html, app] = await Promise.all([readPublic("index.html"), readPublic("app.js")]);
  assert.match(html, /href="\/methodology"/);
  assert.match(html, /Read the evaluation methodology/);
  assert.match(app, /createElement\("table"\)/);
  assert.match(app, /Recommended model/);
  assert.match(app, /Measured cost/);
  assert.match(app, /Cost by model/);
  assert.match(app, /Low — demo/);
  assert.match(app, /Rounded total/);
  assert.match(app, /report\.recommendation_text/);
  assert.doesNotMatch(app, /innerHTML/);
});

test("methodology documents deterministic scoring and model variability", async () => {
  const html = await readPublic("methodology.html");
  assert.match(html, /70% role F1 \+ 20% evidence exactness \+ 10% company-fit accuracy/);
  assert.match(html, /65% quality \+ 20% cost efficiency \+ 15% latency efficiency/);
  assert.match(html, /No model judges another model/);
  assert.match(html, /What is deterministic—and what is not/);
  assert.match(html, /one trial per model on five cases/);
  assert.doesNotMatch(html, /OPENROUTER_API_KEY|OPENAI_API_KEY/);
});
