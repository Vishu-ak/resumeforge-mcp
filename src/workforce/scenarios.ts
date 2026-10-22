import { Scenario, WorkforceInput } from "./types.js";

export function applyScenario(baseInput: WorkforceInput, scenario?: Scenario): WorkforceInput {
  if (!scenario) return baseInput;

  const unavailable = new Set(scenario.unavailableEmployeeIds ?? []);
  const demandMultiplier = scenario.demandMultiplier ?? 1;

  return {
    employees: baseInput.employees.filter((employee) => !unavailable.has(employee.id)),
    demand: baseInput.demand.map((slot) => {
      const dayMultiplier = scenario.demandByDayMultiplier?.[slot.day] ?? 1;
      return {
        ...slot,
        requiredHours: round2(slot.requiredHours * demandMultiplier * dayMultiplier)
      };
    }),
    constraints: {
      ...baseInput.constraints,
      weeklyBudgetMax:
        baseInput.constraints?.weeklyBudgetMax !== undefined
          ? baseInput.constraints.weeklyBudgetMax + (scenario.temporaryBudgetDelta ?? 0)
          : baseInput.constraints?.weeklyBudgetMax
    }
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
