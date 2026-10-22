import { Scenario, WorkforceInput } from "./types.js";

export class WorkforceValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid workforce input: ${issues.join("; ")}`);
  }
}

export function validateWorkforceInput(input: WorkforceInput): void {
  const issues: string[] = [];

  if (!input.employees.length) issues.push("At least one employee is required.");
  if (!input.demand.length) issues.push("At least one demand slot is required.");

  const seen = new Set<string>();
  for (const employee of input.employees) {
    if (seen.has(employee.id)) issues.push(`Duplicate employee id: ${employee.id}`);
    seen.add(employee.id);

    if (employee.costPerHour <= 0) issues.push(`Employee ${employee.id} must have costPerHour > 0.`);
    if (employee.productivityScore <= 0) issues.push(`Employee ${employee.id} must have productivityScore > 0.`);
    if (employee.maxHoursPerWeek <= 0) issues.push(`Employee ${employee.id} must have maxHoursPerWeek > 0.`);
    if (employee.preferredHoursPerWeek < 0) issues.push(`Employee ${employee.id} must have preferredHoursPerWeek >= 0.`);

    for (const [day, availableHours] of Object.entries(employee.availabilityByDay)) {
      if (availableHours < 0) issues.push(`Employee ${employee.id} has negative availability on ${day}.`);
    }
  }

  for (const slot of input.demand) {
    if (slot.requiredHours <= 0) issues.push(`Demand on ${slot.day} must be > 0.`);
  }

  if (input.constraints?.weeklyBudgetMax !== undefined && input.constraints.weeklyBudgetMax <= 0) {
    issues.push("weeklyBudgetMax must be > 0 when provided.");
  }

  if (input.constraints?.fairnessWeight !== undefined && input.constraints.fairnessWeight < 0) {
    issues.push("fairnessWeight must be >= 0 when provided.");
  }

  if (input.constraints?.maxOvertimeHoursPerEmployee !== undefined && input.constraints.maxOvertimeHoursPerEmployee < 0) {
    issues.push("maxOvertimeHoursPerEmployee must be >= 0 when provided.");
  }

  if (issues.length) throw new WorkforceValidationError(issues);
}

export function validateScenario(scenario: Scenario): void {
  const issues: string[] = [];

  if (!scenario.name.trim()) issues.push("Scenario name is required.");
  if (scenario.demandMultiplier !== undefined && scenario.demandMultiplier <= 0) {
    issues.push("Scenario demandMultiplier must be > 0.");
  }
  if (scenario.temporaryBudgetDelta !== undefined && !Number.isFinite(scenario.temporaryBudgetDelta)) {
    issues.push("Scenario temporaryBudgetDelta must be finite.");
  }

  if (issues.length) throw new WorkforceValidationError(issues);
}
