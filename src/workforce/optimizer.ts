import { Assignment, Employee, OptimizationResult, WorkforceInput } from "./types.js";

export function optimizeWorkforce(input: WorkforceInput): OptimizationResult {
  const fairnessWeight = input.constraints?.fairnessWeight ?? 1;
  const overtimeAllowance = input.constraints?.maxOvertimeHoursPerEmployee ?? 0;

  const assignedByEmployee = new Map<string, number>();
  const assignedByDayAndEmployee = new Map<string, number>();
  const assignments: Assignment[] = [];
  const unfilledDemandByDay: Record<string, number> = {};
  const rationale: string[] = [];

  let totalCost = 0;
  let coveredDemandHours = 0;
  const totalDemandHours = input.demand.reduce((sum, d) => sum + d.requiredHours, 0);
  let fallbackApplied = false;

  for (const slot of input.demand) {
    let remaining = slot.requiredHours;

    const strictCandidates = candidateEmployees(input.employees, slot.day, slot.requiredSkills, assignedByEmployee, overtimeAllowance);
    const fallbackCandidates = candidateEmployees(input.employees, slot.day, undefined, assignedByEmployee, overtimeAllowance);

    let candidates = strictCandidates;
    let usingFallback = false;

    if (!candidates.length && slot.requiredSkills?.length) {
      candidates = fallbackCandidates;
      usingFallback = candidates.length > 0;
      if (usingFallback) {
        fallbackApplied = true;
        rationale.push(`Skill fallback used for ${slot.day}: no exact skill match available.`);
      }
    }

    candidates.sort((a, b) => employeePriority(b, assignedByEmployee, fairnessWeight) - employeePriority(a, assignedByEmployee, fairnessWeight));

    for (const employee of candidates) {
      if (remaining <= 0) break;

      const dayKey = `${slot.day}:${employee.id}`;
      const dayAssigned = assignedByDayAndEmployee.get(dayKey) ?? 0;
      const dayCapacity = Math.max((employee.availabilityByDay[slot.day] ?? 0) - dayAssigned, 0);

      const weekAssigned = assignedByEmployee.get(employee.id) ?? 0;
      const weekCapacity = Math.max(employee.maxHoursPerWeek + overtimeAllowance - weekAssigned, 0);

      let allocatable = Math.min(remaining, dayCapacity, weekCapacity);
      if (allocatable <= 0) continue;

      if (input.constraints?.weeklyBudgetMax !== undefined) {
        const budgetRemaining = Math.max(input.constraints.weeklyBudgetMax - totalCost, 0);
        allocatable = Math.min(allocatable, budgetRemaining / employee.costPerHour);
      }

      if (allocatable <= 0) continue;

      allocatable = round2(allocatable);
      if (allocatable <= 0) continue;

      assignments.push({ day: slot.day, employeeId: employee.id, hours: allocatable, usedFallbackSkillRelaxation: usingFallback });
      assignedByEmployee.set(employee.id, weekAssigned + allocatable);
      assignedByDayAndEmployee.set(dayKey, dayAssigned + allocatable);
      totalCost += allocatable * employee.costPerHour;
      coveredDemandHours += allocatable;
      remaining -= allocatable;
    }

    unfilledDemandByDay[slot.day] = round2(Math.max(remaining, 0));
  }

  const coverageRate = totalDemandHours > 0 ? coveredDemandHours / totalDemandHours : 0;
  const utilization = input.employees.map((employee) => {
    const assigned = assignedByEmployee.get(employee.id) ?? 0;
    return assigned / (employee.maxHoursPerWeek || 1);
  });

  const fairnessStdDevHours = stdDev(input.employees.map((employee) => assignedByEmployee.get(employee.id) ?? 0));
  const avgUtilization = utilization.length ? utilization.reduce((sum, value) => sum + value, 0) / utilization.length : 0;

  const objectiveScore = round2(coverageRate * 100 - fairnessStdDevHours - totalCost / 1000);
  const infeasible = Object.values(unfilledDemandByDay).some((hours) => hours > 0);

  if (input.constraints?.minCoverageRate !== undefined && coverageRate < input.constraints.minCoverageRate) {
    rationale.push(`Coverage target missed: ${coverageRate.toFixed(2)} < ${input.constraints.minCoverageRate.toFixed(2)}.`);
  }

  if (infeasible) rationale.push("Not all demand could be covered with current staffing and constraints.");

  return {
    assignments,
    unfilledDemandByDay,
    totalCost: round2(totalCost),
    totalDemandHours: round2(totalDemandHours),
    coveredDemandHours: round2(coveredDemandHours),
    coverageRate: round2(coverageRate),
    avgUtilization: round2(avgUtilization),
    fairnessStdDevHours: round2(fairnessStdDevHours),
    objectiveScore,
    infeasible,
    fallbackApplied,
    rationale
  };
}

function candidateEmployees(
  employees: Employee[],
  day: string,
  requiredSkills: string[] | undefined,
  assignedByEmployee: Map<string, number>,
  overtimeAllowance: number
): Employee[] {
  const required = new Set((requiredSkills ?? []).map((skill) => skill.toLowerCase()));

  return employees.filter((employee) => {
    const availability = employee.availabilityByDay[day] ?? 0;
    if (availability <= 0) return false;

    const assigned = assignedByEmployee.get(employee.id) ?? 0;
    if (assigned >= employee.maxHoursPerWeek + overtimeAllowance) return false;

    if (!required.size) return true;

    const normalized = new Set(employee.skills.map((skill) => skill.toLowerCase()));
    for (const skill of required) {
      if (!normalized.has(skill)) return false;
    }
    return true;
  });
}

function employeePriority(employee: Employee, assignedByEmployee: Map<string, number>, fairnessWeight: number): number {
  const assigned = assignedByEmployee.get(employee.id) ?? 0;
  const fairnessPenalty = employee.preferredHoursPerWeek > 0 ? (assigned / employee.preferredHoursPerWeek) * fairnessWeight : 0;
  return employee.productivityScore * 2 - employee.costPerHour * 0.05 - fairnessPenalty;
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
