# Requirements and Constraints

## Business requirements
- Cover required labor demand by day.
- Prefer employees with stronger productivity and skill matches.
- Keep total weekly labor cost within budget.
- Balance workload to reduce burnout risk.

## Hard constraints
- Employee weekly max hours (+ optional overtime allowance).
- Employee daily availability cap.
- Non-negative and valid demand input.
- Optional weekly budget ceiling.

## Soft constraints
- Exact skill matching per demand slot.
- Fairness weighting (avoid overloading a small subset of employees).
- Preferred weekly hours (used as fairness/turnover signal).

## Fallback logic
When no exact skill match can satisfy a slot, the optimizer relaxes skill matching and records rationale so planners can manually review training/cross-skilling decisions.
