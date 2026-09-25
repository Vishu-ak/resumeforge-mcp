import { QUICK_CERTS } from "../data/certs.js";
import type { SkillCategory } from "../data/skills.js";
import type { JDAnalysis } from "./jd.js";
import type { SkillHit } from "./skills.js";

/** Display groups for the Skills section. Soft skills are shown through bullets, not listed. */
const GROUP: Partial<Record<SkillCategory, string>> = {
  language: "Languages",
  frontend: "Frontend",
  backend: "Backend & APIs",
  mobile: "Mobile",
  database: "Databases",
  cloud: "Cloud & DevOps",
  devops: "Cloud & DevOps",
  data: "Data & Analytics",
  ml_ai: "AI / ML",
  testing: "Testing",
  security: "Security",
  architecture: "Engineering Practices",
  practice: "Engineering Practices",
  tool: "Tools",
  design: "Design & Product",
  product: "Design & Product",
  business: "Business & Domain",
};

export interface SkillsLine {
  category: string;
  items: string[];
}

/**
 * A ready-to-use Skills section: JD keywords first (in the JD's exact phrasing),
 * grouped in the order the JD emphasizes, plus a "Familiar with" line for skills
 * the candidate has only touched or is learning. Only evidence-backed skills.
 */
export function draftSkillsSection(
  jd: JDAnalysis,
  have: { resume: Map<string, SkillHit>; other: Map<string, SkillHit> },
  learning: Set<string>,
): SkillsLine[] {
  const kw = new Map(jd.keywords.map((k) => [k.skill, k]));
  const all = new Map<string, SkillHit>([...have.other, ...have.resume]);
  const groups = new Map<string, { name: string; weight: number }[]>();
  const familiar: string[] = [];

  for (const [name, hit] of all) {
    const group = GROUP[hit.skill.category];
    if (!group) continue;
    const k = kw.get(name);
    // Non-JD skills only pad the list if they're on the resume itself.
    if (!k && !have.resume.has(name)) continue;
    const label = k?.write_as ?? name;
    if (learning.has(name) && !have.resume.has(name)) {
      familiar.push(label);
      continue;
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ name: label, weight: k?.weight ?? 0 });
  }

  const groupWeight = (g: { weight: number }[]) => g.reduce((a, x) => a + x.weight, 0);
  const lines: SkillsLine[] = [...groups.entries()]
    // Recruiters expect Languages first; the rest follow the JD's emphasis.
    .sort((a, b) => (b[0] === "Languages" ? 1 : 0) - (a[0] === "Languages" ? 1 : 0) || groupWeight(b[1]) - groupWeight(a[1]))
    .map(([category, items]) => {
      const sorted = items.sort((a, b) => b.weight - a.weight);
      // Keep every JD keyword; cap filler so lines stay scannable.
      const jdItems = sorted.filter((i) => i.weight > 0);
      const filler = sorted.filter((i) => i.weight === 0).slice(0, Math.max(0, 8 - jdItems.length));
      return { category, items: [...jdItems, ...filler].map((i) => i.name) };
    })
    .filter((l) => l.items.length);

  if (familiar.length) lines.push({ category: "Familiar with", items: familiar });
  return lines;
}

export interface CertSuggestion {
  name: string;
  issuer: string;
  prep: string;
  closes: string[];
  list_on_resume_as: string;
  note: string;
}

function monthYear(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Certifications that close the most gap weight for the least prep time. */
export function suggestQuickCerts(
  jd: JDAnalysis,
  gaps: { skill: string; weight: number }[],
  candidateText: string,
  now = new Date(),
  max = 3,
): CertSuggestion[] {
  const gapW = new Map(gaps.map((g) => [g.skill, g.weight]));
  const jdW = new Map(jd.keywords.map((k) => [k.skill, k.weight]));
  const lower = candidateText.toLowerCase();
  const pool = QUICK_CERTS.filter((c) => !lower.includes(c.name.toLowerCase()));
  const covered = new Set<string>();
  const picked: { c: (typeof QUICK_CERTS)[number]; closes: string[] }[] = [];
  // Greedy set cover: each pick must close gaps the previous picks didn't.
  while (picked.length < max) {
    let best: { c: (typeof QUICK_CERTS)[number]; closes: string[]; score: number } | null = null;
    for (const c of pool) {
      if (picked.some((p) => p.c === c)) continue;
      const closes = c.skills.filter((s) => gapW.has(s) && !covered.has(s));
      const named = jd.certifications.some((n) => n.toLowerCase().includes(c.name.toLowerCase().slice(0, 18)));
      if (!closes.length && !named) continue;
      const score =
        closes.reduce((a, s) => a + (gapW.get(s) ?? 0), 0) +
        c.skills.reduce((a, s) => a + (jdW.get(s) ?? 0) * 0.25, 0) +
        (named ? 10 : 0) -
        c.prep_hours[1] / 40;
      if (score > 1 && (!best || score > best.score)) best = { c, closes, score };
    }
    if (!best) break;
    picked.push(best);
    best.closes.forEach((s) => covered.add(s));
  }
  return picked.map(({ c, closes }) => {
      const weeks = Math.max(1, Math.ceil(c.prep_hours[1] / 10));
      const expected = new Date(now.getTime() + weeks * 7 * 86400000);
      return {
        name: c.name,
        issuer: c.issuer,
        prep: `${c.prep_hours[0]}–${c.prep_hours[1]} hours (about ${weeks} week${weeks > 1 ? "s" : ""} at 10 hrs/week)`,
        closes,
        list_on_resume_as: `${c.name} (In Progress, expected ${monthYear(expected)})`,
        note: "Only list it once you've actually started studying, and check the issuer's site for the current exam and price.",
      };
    });
}
