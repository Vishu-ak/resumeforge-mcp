import { ARCHETYPES, DEFAULT_THEME, DOMAIN_THEMES, type ProjectArchetype } from "../data/projects.js";
import { SKILLS } from "../data/skills.js";

const CONCEPT_CATEGORIES = new Set(["architecture", "practice", "soft_skill", "business", "product", "design"]);
const CATEGORY_OF = new Map(SKILLS.map((s) => [s.name, s.category as string]));
const isConcrete = (skill: string) => !CONCEPT_CATEGORIES.has(CATEGORY_OF.get(skill) ?? "practice");

export interface BridgeProject {
  archetype: string;
  name: string;
  pitch: string;
  stack: string[];
  closes_gaps: string[];
  uses_existing_skills: string[];
  build_plan: string[];
  resume_bullets_template: string[];
  stretch_goals: string[];
  interview_talking_points: string[];
  estimated_effort_hours: string;
  suggested_repo_name: string;
  honesty_note: string;
}

export interface BridgeInput {
  /** Missing JD skills with their JD weight. */
  gaps: { skill: string; weight: number }[];
  /** Skills the candidate already has (canonical names). */
  candidate_skills: string[];
  /** JD text (used to theme projects to the company's domain). */
  jd_text: string;
  company?: string | null;
  max_projects?: number;
}

const cap = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

export function pickTheme(jdText: string) {
  let best: (typeof DOMAIN_THEMES)[number] | null = null;
  let bestCount = 0;
  for (const t of DOMAIN_THEMES) {
    const count = (jdText.match(new RegExp(t.match.source, "gi")) ?? []).length;
    if (count > bestCount) {
      best = t;
      bestCount = count;
    }
  }
  return best ?? DEFAULT_THEME;
}

function pickCloud(gaps: string[], have: string[]): string {
  const all = [...gaps, ...have];
  if (all.includes("Google Cloud Platform")) return "GCP";
  if (all.includes("Microsoft Azure")) return "Azure";
  return "AWS";
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/**
 * Pick the fewest archetypes that close the most (weighted) gap, preferring
 * ones that build on skills the candidate already has so they are realistic.
 */
export function suggestBridgeProjects(input: BridgeInput): BridgeProject[] {
  const max = input.max_projects ?? 3;
  const gapWeight = new Map(input.gaps.map((g) => [g.skill, g.weight]));
  const have = new Set(input.candidate_skills);
  const remaining = new Set(gapWeight.keys());
  const theme = pickTheme(input.jd_text);
  const chosen: { a: ProjectArchetype; closes: string[]; uses: string[] }[] = [];

  while (chosen.length < max && remaining.size > 0) {
    let best: { a: ProjectArchetype; score: number; closes: string[]; uses: string[] } | null = null;
    for (const a of ARCHETYPES) {
      if (chosen.some((c) => c.a.id === a.id)) continue;
      const closes = a.skills.filter((s) => remaining.has(s));
      if (!closes.length) continue;
      const uses = a.skills.filter((s) => have.has(s));
      const score = closes.reduce((acc, s) => acc + (gapWeight.get(s) ?? 0), 0) + Math.min(uses.length, 4) * 0.75;
      if (!best || score > best.score) best = { a, score, closes, uses };
    }
    if (!best) break;
    chosen.push(best);
    best.closes.forEach((s) => remaining.delete(s));
  }

  return chosen.map(({ a, closes, uses }) => {
    const closesSorted = [...closes].sort((x, y) => (gapWeight.get(y) ?? 0) - (gapWeight.get(x) ?? 0));
    // Concrete tech first (what goes in the "Tech:" line); concepts are covered by the build plan.
    const stack = [
      ...closesSorted.filter(isConcrete).slice(0, 5),
      ...uses.filter((u) => !closes.includes(u) && isConcrete(u)).slice(0, 3),
    ];
    const cloud = pickCloud(closes, [...have]);
    const vars: Record<string, string> = {
      domain: theme.domain,
      Domain: cap(theme.domain),
      entity: theme.entity,
      Entity: cap(theme.entity),
      entities: theme.entities,
      event: theme.event,
      users: theme.users,
      cloud,
      Cloud: cloud,
      stack: stack.slice(0, 4).join(", "),
      Stack: stack[0] ?? "",
      company: input.company ?? "the target company",
    };
    const name = fill(a.name, vars);
    return {
      archetype: a.id,
      name,
      pitch: fill(a.pitch, vars),
      stack,
      closes_gaps: closesSorted,
      uses_existing_skills: uses,
      build_plan: a.build_plan.map((s) => fill(s, vars)),
      resume_bullets_template: a.bullets.map((s) => fill(s, vars)),
      stretch_goals: a.stretch,
      interview_talking_points: a.talking_points,
      estimated_effort_hours: `${a.effort_hours[0]}–${a.effort_hours[1]} hours`,
      suggested_repo_name: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
      honesty_note:
        "Replace every [N]/[X]/[Y] with numbers you actually measured. Until it's built, list it as status 'in_progress' (rendered as 'In Progress'). Push the code to GitHub; interviewers do click.",
    };
  });
}
