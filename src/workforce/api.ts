import { PipelineRequest, PipelineResult } from "./types.js";
import { runWorkforceOptimizationPipeline } from "./pipeline.js";

export function optimizeWorkforceFromRequest(request: PipelineRequest): PipelineResult {
  return runWorkforceOptimizationPipeline(request);
}
