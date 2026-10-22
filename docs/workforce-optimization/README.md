# Workforce Optimization Project Blueprint

This repository now includes a workforce optimization starter implementation focused on **shift-hour allocation**.

## Goal
Optimize staffing decisions to improve:
- Cost efficiency
- Demand coverage
- Productivity alignment
- Fairness of workload
- Turnover risk proxy (over-assignment vs preferred hours)

## Success metrics (KPIs)
- Coverage rate
- Total staffing cost
- Average utilization
- Fairness standard deviation of assigned hours
- Estimated turnover risk

## V1 scope
In scope:
- Weekly allocation of employee hours to demand slots
- Skill-aware matching with fallback when no exact match exists
- Budget, capacity, and overtime constraints
- Scenario simulation for what-if planning
- Baseline vs optimized KPI comparison

Out of scope:
- Payroll/tax processing
- Leave approval workflows
- Multi-site legal compliance automation by jurisdiction
- Real-time shift swaps

## Main implementation paths
- Optimization logic: `/home/runner/work/resumeforge-mcp/resumeforge-mcp/src/workforce/optimizer.ts`
- Pipeline orchestration: `/home/runner/work/resumeforge-mcp/resumeforge-mcp/src/workforce/pipeline.ts`
- Input validation: `/home/runner/work/resumeforge-mcp/resumeforge-mcp/src/workforce/validation.ts`
- KPI evaluation: `/home/runner/work/resumeforge-mcp/resumeforge-mcp/src/workforce/evaluation.ts`
- Tests: `/home/runner/work/resumeforge-mcp/resumeforge-mcp/tests/workforce.test.ts`
