import { comparePlans, evaluatePlan } from "./evaluation.js";
import { optimizeWorkforce } from "./optimizer.js";
import { applyScenario } from "./scenarios.js";
import { PipelineRequest, PipelineResult } from "./types.js";
import { validateScenario, validateWorkforceInput } from "./validation.js";

export function runWorkforceOptimizationPipeline(request: PipelineRequest): PipelineResult {
  validateWorkforceInput(request.baseInput);
  if (request.scenario) validateScenario(request.scenario);

  const effectiveInput = applyScenario(request.baseInput, request.scenario);
  validateWorkforceInput(effectiveInput);

  const optimization = optimizeWorkforce(effectiveInput);
  const kpis = evaluatePlan(effectiveInput, optimization.assignments);
  const comparison = request.baselineAssignments
    ? comparePlans(effectiveInput, request.baselineAssignments, optimization.assignments)
    : undefined;

  return {
    effectiveInput,
    optimization,
    kpis,
    comparison
  };
}
