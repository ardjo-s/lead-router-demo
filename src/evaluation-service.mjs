import { createOpenAIProvider, createOpenRouterProvider, evaluate } from "./evaluator.mjs";
import { fetchWorkflow, validateRequest } from "./workflow.mjs";

export class ConfigurationError extends Error {}

export async function executeEvaluation(input, env = process.env) {
  const request = validateRequest(input);
  const provider = env.OPENROUTER_API_KEY
    ? createOpenRouterProvider(env.OPENROUTER_API_KEY)
    : env.OPENAI_API_KEY
      ? createOpenAIProvider(env.OPENAI_API_KEY)
      : null;

  if (!provider) {
    throw new ConfigurationError("Server model credential is not configured.");
  }

  const workflow = await fetchWorkflow(request);
  return evaluate({ request, workflow, provider });
}
