export type DayKey = string;

export type Employee = {
  id: string;
  name: string;
  skills: string[];
  costPerHour: number;
  productivityScore: number;
  maxHoursPerWeek: number;
  preferredHoursPerWeek: number;
  availabilityByDay: Record<DayKey, number>;
};

export type DemandSlot = {
  day: DayKey;
  requiredHours: number;
  requiredSkills?: string[];
};

export type WorkforceConstraints = {
  weeklyBudgetMax?: number;
  fairnessWeight?: number;
  maxOvertimeHoursPerEmployee?: number;
  minCoverageRate?: number;
};

export type WorkforceInput = {
  employees: Employee[];
  demand: DemandSlot[];
  constraints?: WorkforceConstraints;
};

export type Scenario = {
  name: string;
  demandMultiplier?: number;
  demandByDayMultiplier?: Record<DayKey, number>;
  unavailableEmployeeIds?: string[];
  temporaryBudgetDelta?: number;
};

export type Assignment = {
  day: DayKey;
  employeeId: string;
  hours: number;
  usedFallbackSkillRelaxation: boolean;
};

export type OptimizationResult = {
  assignments: Assignment[];
  unfilledDemandByDay: Record<DayKey, number>;
  totalCost: number;
  totalDemandHours: number;
  coveredDemandHours: number;
  coverageRate: number;
  avgUtilization: number;
  fairnessStdDevHours: number;
  objectiveScore: number;
  infeasible: boolean;
  fallbackApplied: boolean;
  rationale: string[];
};

export type KPIReport = {
  coverageRate: number;
  totalCost: number;
  avgUtilization: number;
  fairnessStdDevHours: number;
  estimatedTurnoverRisk: number;
};

export type ComparisonReport = {
  baseline: KPIReport;
  optimized: KPIReport;
  deltas: {
    coverageRate: number;
    totalCost: number;
    avgUtilization: number;
    fairnessStdDevHours: number;
    estimatedTurnoverRisk: number;
  };
};

export type PipelineRequest = {
  baseInput: WorkforceInput;
  scenario?: Scenario;
  baselineAssignments?: Assignment[];
};

export type PipelineResult = {
  effectiveInput: WorkforceInput;
  optimization: OptimizationResult;
  kpis: KPIReport;
  comparison?: ComparisonReport;
};
