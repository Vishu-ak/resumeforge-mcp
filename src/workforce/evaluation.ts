import { Assignment, ComparisonReport, Employee, KPIReport, WorkforceInput } from "./types.js";

export function evaluatePlan(input: WorkforceInput, assignments: Assignment[]): KPIReport {
  const employeeMap = new Map(input.employees.map((employee) => [employee.id, employee]));
  const totalDemand = input.demand.reduce((sum, slot) => sum + slot.requiredHours, 0);
  const totalAssigned = assignments.reduce((sum, assignment) => sum + assignment.hours, 0);

  const byEmployee = aggregateHoursByEmployee(assignments);

  let totalCost = 0;
  let utilization = 0;
  for (const employee of input.employees) {
    const hours = byEmployee.get(employee.id) ?? 0;
    totalCost += hours * employee.costPerHour;
    utilization += employee.maxHoursPerWeek > 0 ? hours / employee.maxHoursPerWeek : 0;
  }

  const avgUtilization = input.employees.length ? utilization / input.employees.length : 0;
  const fairnessStdDevHours = stdDev(input.employees.map((employee) => byEmployee.get(employee.id) ?? 0));

  let turnoverRiskCount = 0;
  for (const employee of input.employees) {
    const assigned = byEmployee.get(employee.id) ?? 0;
    if (assigned > employee.preferredHoursPerWeek) turnoverRiskCount += 1;
  }

  return {
    coverageRate: totalDemand > 0 ? Math.min(totalAssigned / totalDemand, 1) : 0,
    totalCost,
    avgUtilization,
    fairnessStdDevHours,
    estimatedTurnoverRisk: input.employees.length ? turnoverRiskCount / input.employees.length : 0
  };
}

export function comparePlans(input: WorkforceInput, baseline: Assignment[], optimized: Assignment[]): ComparisonReport {
  const baselineKpi = evaluatePlan(input, baseline);
  const optimizedKpi = evaluatePlan(input, optimized);

  return {
    baseline: baselineKpi,
    optimized: optimizedKpi,
    deltas: {
      coverageRate: optimizedKpi.coverageRate - baselineKpi.coverageRate,
      totalCost: optimizedKpi.totalCost - baselineKpi.totalCost,
      avgUtilization: optimizedKpi.avgUtilization - baselineKpi.avgUtilization,
      fairnessStdDevHours: optimizedKpi.fairnessStdDevHours - baselineKpi.fairnessStdDevHours,
      estimatedTurnoverRisk: optimizedKpi.estimatedTurnoverRisk - baselineKpi.estimatedTurnoverRisk
    }
  };
}

function aggregateHoursByEmployee(assignments: Assignment[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const assignment of assignments) {
    totals.set(assignment.employeeId, (totals.get(assignment.employeeId) ?? 0) + assignment.hours);
  }
  return totals;
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
