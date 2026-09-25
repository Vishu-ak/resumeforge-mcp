# Contributing to ResumeForge

Thanks for helping people get past the first screen. The highest-impact contributions are usually **data**, not code.

## High-impact areas

| Area | File | What helps |
|---|---|---|
| Skill taxonomy | `src/data/skills.ts` | New skills, and especially the **aliases** real JDs use ("k8s", "Postgres", "CI / CD"). Mark short ambiguous names with `cs(...)` (case-sensitive). Never add aliases that are common English words ("express", "rest", "solid"). |
| Implied skills | `src/core/skills.ts` → `IMPLIES` | "Using X is evidence of Y" pairs (Jenkins → CI/CD). One direction only. |
| Adjacent skills | `src/core/gap.ts` → `ADJACENT` | Interchangeable tools, where knowing one makes the other a fast pick-up. |
| Bridge projects | `src/data/projects.ts` | New archetypes, or domain themes (`DOMAIN_THEMES`) for industries we don't cover yet. |
| Non-tech roles | all of the above | Nursing, teaching, finance, sales and ops keywords, plus bridge archetypes for them. |
| JD section detection | `src/core/jd.ts` → `SECTION_PATTERNS` | Header phrasings from real postings in other formats and languages. |

## Ground rules

1. **Truthfulness is a feature.** Don't add anything that helps fabricate employers, titles, dates, degrees or metrics, or that hides keywords from human readers.
2. **Every behavior change needs a test.** Add a fixture-based case in `tests/`. When fixing a mis-parse, add the real JD snippet that broke.
3. Keep the connector **stateless and offline**. No network calls from tools, and no storage of candidate data.

## Dev loop

```bash
npm install
npm test
npm run typecheck
npm run dev        # stdio
npm run inspect    # MCP Inspector against dist/
```

Anonymize any real JD or resume you add as a fixture (fictional company and person names, example.com emails).
