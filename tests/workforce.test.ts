import { describe, expect, it } from "vitest";
import { optimizeWorkforce } from "../src/workforce/optimizer.js";
import { runWorkforceOptimizationPipeline } from "../src/workforce/pipeline.js";
import { validateWorkforceInput, WorkforceValidationError } from "../src/workforce/validation.js";
import type { WorkforceInput } from "../src/workforce/types.js";

function baseInput(): WorkforceInput {
  return {
    employees: [
      {
        id: "e1",
        name: "Ava",
        skills: ["cashier", "inventory"],
        costPerHour: 20,
        productivityScore: 1.2,
        maxHoursPerWeek: 20,
        preferredHoursPerWeek: 16,
        availabilityByDay: { mon: 8, tue: 8, wed: 4 }
      },
      {
        id: "e2",
        name: "Noah",
        skills: ["cashier"],
        costPerHour: 18,
        productivityScore: 1.1,
        maxHoursPerWeek: 24,
        preferredHoursPerWeek: 20,
        availabilityByDay: { mon: 8, tue: 8, wed: 8 }
      }
    ],
    demand: [
      { day: "mon", requiredHours: 8, requiredSkills: ["cashier"] },
      { day: "tue", requiredHours: 8, requiredSkills: ["cashier"] },
      { day: "wed", requiredHours: 6, requiredSkills: ["inventory"] }
    ],
    constraints: {
      weeklyBudgetMax: 600,
      fairnessWeight: 1,
      maxOvertimeHoursPerEmployee: 2,
      minCoverageRate: 0.85
    }
  };
}

describe("workforce validation", () => {
  it("rejects duplicate employee IDs", () => {
    const input = baseInput();
    input.employees[1].id = "e1";
    expect(() => validateWorkforceInput(input)).toThrow(WorkforceValidationError);
  });
});

describe("workforce optimization", () => {
  it("respects weekly max hours and allocates demand", () => {
    const result = optimizeWorkforce(baseInput());
    const totals = new Map<string, number>();

    for (const assignment of result.assignments) {
      totals.set(assignment.employeeId, (totals.get(assignment.employeeId) ?? 0) + assignment.hours);
    }

    expect(totals.get("e1") ?? 0).toBeLessThanOrEqual(22);
    expect(totals.get("e2") ?? 0).toBeLessThanOrEqual(26);
    expect(result.coverageRate).toBeGreaterThanOrEqual(0.85);
  });

  it("supports what-if scenarios with reduced availability", () => {
    const pipeline = runWorkforceOptimizationPipeline({
      baseInput: baseInput(),
      scenario: {
        name: "Noah PTO",
        unavailableEmployeeIds: ["e2"],
        demandMultiplier: 1.2
      }
    });

    expect(pipeline.effectiveInput.employees).toHaveLength(1);
    expect(pipeline.optimization.infeasible).toBe(true);
    expect(pipeline.optimization.coverageRate).toBeLessThan(1);
  });

  it("compares optimized vs baseline KPIs", () => {
    const baseline = [
      { day: "mon", employeeId: "e1", hours: 8, usedFallbackSkillRelaxation: false },
      { day: "tue", employeeId: "e1", hours: 8, usedFallbackSkillRelaxation: false },
      { day: "wed", employeeId: "e1", hours: 2, usedFallbackSkillRelaxation: false }
    ];

    const result = runWorkforceOptimizationPipeline({
      baseInput: baseInput(),
      baselineAssignments: baseline
    });

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.optimized.coverageRate).toBeGreaterThan(result.comparison!.baseline.coverageRate);
  });
});
