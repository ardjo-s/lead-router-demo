const ratio = (a, b) => b === 0 ? 0 : a / b;
const leadKey = (lead) => `${lead?.source_id}::${lead?.buying_role}`;
export function scoreDocument(output, workflow) {
  const cases = new Map(workflow.cases.cases.map((x) => [x.case_id, x]));
  const truth = new Map(workflow.truth.cases.map((x) => [x.case_id, x]));
  const errors = [], results = Array.isArray(output?.results) ? output.results : [], resultMap = new Map();
  if (output?.workflow_version !== workflow.cases.workflow_version) errors.push("workflow_version does not match the benchmark.");
  if (!Array.isArray(output?.results)) errors.push("results must be an array.");
  for (const result of results) {
    if (!result || typeof result.case_id !== "string") { errors.push("Every result requires a string case_id."); continue; }
    if (resultMap.has(result.case_id)) errors.push(`Duplicate result for ${result.case_id}.`);
    resultMap.set(result.case_id, result);
  }
  let fitCorrect=0, truePositive=0, falsePositive=0, falseNegative=0, evidenceExact=0, returnedLeads=0;
  for (const [caseId, benchmarkCase] of cases) {
    const expected = truth.get(caseId), result = resultMap.get(caseId);
    if (!result) { errors.push(`Missing result for ${caseId}.`); falseNegative += expected.expected_leads.length; continue; }
    if (result.company_name !== benchmarkCase.company.name) errors.push(`company_name mismatch for ${caseId}.`);
    if (result.company_fit === expected.company_fit) fitCorrect++; else if (typeof result.company_fit !== "boolean") errors.push(`company_fit must be boolean for ${caseId}.`);
    if (!Array.isArray(result.leads)) { errors.push(`leads must be an array for ${caseId}.`); falseNegative += expected.expected_leads.length; continue; }
    const sources = new Map(benchmarkCase.sources.map((s) => [s.source_id, s]));
    const expectedKeys = new Set(expected.expected_leads.map(leadKey)), actualKeys = new Set();
    for (const lead of result.leads) {
      returnedLeads++; const key = leadKey(lead);
      if (actualKeys.has(key)) errors.push(`Duplicate lead ${key} in ${caseId}.`); actualKeys.add(key);
      const source = sources.get(lead?.source_id);
      if (!source) errors.push(`Unknown source_id ${lead?.source_id} in ${caseId}.`);
      else {
        if (lead.person_name !== source.person_name) errors.push(`person_name mismatch for ${lead.source_id}.`);
        if (lead.title !== source.title) errors.push(`title mismatch for ${lead.source_id}.`);
        if (lead.source_url !== source.url) errors.push(`source_url mismatch for ${lead.source_id}.`);
        if (typeof lead.evidence_quote === "string" && lead.evidence_quote.length >= 10 && source.text.includes(lead.evidence_quote)) evidenceExact++;
        else errors.push(`evidence_quote is not exact for ${lead.source_id}.`);
      }
      if (typeof lead.confidence !== "number" || lead.confidence < 0 || lead.confidence > 1) errors.push(`confidence is invalid for ${lead?.source_id}.`);
    }
    for (const key of actualKeys) expectedKeys.has(key) ? truePositive++ : falsePositive++;
    for (const key of expectedKeys) if (!actualKeys.has(key)) falseNegative++;
  }
  for (const caseId of resultMap.keys()) if (!cases.has(caseId)) errors.push(`Unknown case_id ${caseId}.`);
  if (results.length !== cases.size) errors.push(`Expected ${cases.size} results, received ${results.length}.`);
  const precision=ratio(truePositive,truePositive+falsePositive), recall=ratio(truePositive,truePositive+falseNegative);
  const roleF1=precision+recall===0?0:(2*precision*recall)/(precision+recall);
  const evidenceExactness=ratio(evidenceExact,Math.max(returnedLeads,1)), companyFitAccuracy=ratio(fitCorrect,cases.size);
  const weights=workflow.benchmark.scoring.quality_components;
  const quality=weights.role_f1*roleF1+weights.evidence_exactness*evidenceExactness+weights.company_fit_accuracy*companyFitAccuracy;
  return { schema_valid:errors.length===0, role_precision:precision, role_recall:recall, role_f1:roleF1, evidence_exactness:evidenceExactness, company_fit_accuracy:companyFitAccuracy, quality_score:Number(quality.toFixed(12)), expected_leads:truePositive+falseNegative, returned_leads:returnedLeads, errors };
}
export function estimateCost(usage, price) {
  if (!usage || !price) return null;
  const cached=usage.input_tokens_details?.cached_tokens||0, uncached=Math.max(0,(usage.input_tokens||0)-cached);
  return Number(((uncached*price.input+cached*price.cached_input+(usage.output_tokens||0)*price.output)/1e6).toFixed(8));
}
export function rankResults(results, workflow) {
  const successful=results.filter((x)=>x.status==="completed"), costs=successful.map((x)=>x.estimated_cost_usd).filter(Number.isFinite), latencies=successful.map((x)=>x.latency_ms).filter(Number.isFinite);
  const bestCost=Math.min(...costs), bestLatency=Math.min(...latencies), minQuality=workflow.benchmark.scoring.minimum_quality_to_recommend, weights=workflow.benchmark.scoring.recommendation_components;
  for (const item of successful) {
    item.eligible=item.score.schema_valid&&item.score.quality_score>=minQuality&&Number.isFinite(item.estimated_cost_usd)&&Number.isFinite(item.latency_ms)&&item.usage!=null;
    item.ineligible_reasons=[!item.score.schema_valid&&"invalid structured output",item.score.quality_score<minQuality&&`quality below ${minQuality}`,!Number.isFinite(item.estimated_cost_usd)&&"missing pricing",!item.usage&&"missing usage"].filter(Boolean);
    item.composite_score=item.eligible?Number((weights.quality*item.score.quality_score+weights.cost_efficiency*(bestCost/item.estimated_cost_usd)+weights.latency_efficiency*(bestLatency/item.latency_ms)).toFixed(12)):null;
  }
  successful.sort((a,b)=>(b.composite_score??-1)-(a.composite_score??-1)||b.score.quality_score-a.score.quality_score||(a.estimated_cost_usd??Infinity)-(b.estimated_cost_usd??Infinity)||a.latency_ms-b.latency_ms);
  return successful;
}
