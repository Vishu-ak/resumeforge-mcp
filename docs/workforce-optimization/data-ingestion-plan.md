# Data Model and Ingestion Plan

## Required datasets
1. Employees
   - ID, name, skills, cost/hour, productivity score
   - weekly capacity and preferred weekly hours
   - availability by day
2. Demand slots
   - Day, required hours, required skills
3. Constraints
   - Budget cap, fairness weight, overtime allowance, target coverage
4. Optional baseline plan
   - Existing manual assignment to compare against optimized output

## Data quality checks
- Unique employee IDs
- Positive numeric values for cost/productivity/capacity
- Non-empty employees and demand arrays
- Non-negative daily availability
- Positive demand hours

## Refresh cadence
- Weekly full refresh for planning horizon
- Mid-week scenario reruns for absences/spikes

## Sample seed data
- `/home/runner/work/resumeforge-mcp/resumeforge-mcp/workforce-optimization/data/sample-employees.json`
- `/home/runner/work/resumeforge-mcp/resumeforge-mcp/workforce-optimization/data/sample-demand.json`
