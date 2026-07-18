import fs from "node:fs/promises";
const ROOT="/Users/ardjo/CODE/repos/ascii-box-lead-workflow",read=async(path)=>JSON.parse(await fs.readFile(`${ROOT}/${path}`,"utf8"));
export async function fixtureWorkflow(){return{benchmark:await read("workflow/benchmark.json"),prompt:await fs.readFile(`${ROOT}/workflow/prompt.md`,"utf8"),cases:await read("workflow/cases.json"),truth:await read("workflow/ground-truth.json"),schema:await read("workflow/output.schema.json"),models:await read("config/models.json"),pricing:await read("config/model-pricing.json")};}
export const perfectOutput=()=>read("examples/perfect-output.json");
