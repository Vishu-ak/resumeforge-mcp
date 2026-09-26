import { CATEGORY_LABELS, HARD_CATEGORIES, type SkillCategory } from "../data/skills.js";
import { draftSkillsSection, suggestQuickCerts, type CertSuggestion, type SkillsLine } from "./boost.js";
import { suggestBridgeProjects, type BridgeProject } from "./bridge.js";
import type { JDAnalysis, JDKeyword } from "./jd.js";
import { estimateYearsOfExperience } from "./resumeParse.js";
import { findHiddenExperience, professionalRoles, type ExperiencePromotion } from "./roles.js";
import { translateTitles, type TitleTranslation } from "./titles.js";
import { findSkills, impliedBy } from "./skills.js";
import { isStopword, toLines, unique } from "./text.js";

export type GapStrategy = "surface" | "reframe" | "ask_candidate" | "bridge_project" | "quick_learn";

export interface GapItem {
  skill: string;
  importance: JDKeyword["importance"];
  weight: number;
  write_as: string;
  strategy: GapStrategy;
  reason: string;
  related_skills_you_have?: string[];
  quick_learn_hours?: string;
  /** Candidate mentions this skill only as something they're learning. */
  learning?: boolean;
}

const LEARNING_RE = /\b(learning|studying|exploring|picking up|course|bootcamp|tutorial|beginner|basic knowledge)\b/i;

function isLearningMention(skill: string, text: string): boolean {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .some((line) => LEARNING_RE.test(line) && findSkills(line).has(skill));
}

/** Skill lists, headers and contact lines aren't evidence of doing anything. */
function isEvidenceLine(l: string): boolean {
  if (l.split(/\s+/).length < 6) return false;
  if ((l.match(/\|/g) ?? []).length >= 2) return false;
  const commas = (l.match(/,/g) ?? []).length;
  const skillish = findSkills(l).size;
  return !(commas >= 4 && skillish >= 4);
}

export interface EvidenceLink {
  focus_point: string;
  best_matching_lines: { line: string; overlap: string[] }[];
  guidance: string;
}

export interface GapAnalysis {
  baseline_keyword_coverage: number;
  must_have_coverage: string;
  matched: { skill: string; importance: string; write_as: string }[];
  gaps: GapItem[];
  evidence_map: EvidenceLink[];
  bridge_projects: BridgeProject[];
  candidate_profile: {
    years_experience: number | null;
    years_required: number | null;
    experience_gap_years: number;
    career_stage: string;
    hard_skill_match_ratio: number;
  };
  resume_plan: {
    headline: string;
    section_order: string[];
    summary_formula: string;
    skills_section_order: string[];
    /** Drop-in Skills section (JD phrasing, JD emphasis order, "Familiar with" tier). */
    skills_section_draft: SkillsLine[];
    /** Internal titles mapped to the market title recruiters search for. */
    title_translations: TitleTranslation[];
    /** Real but buried work that deserves its own Experience entry. */
    experience_promotions: ExperiencePromotion[];
    notes: string[];
  };
  quick_win_certifications: CertSuggestion[];
  questions_for_candidate: string[];
}

/** Interchangeable technologies: knowing one makes the other a credible, fast pick-up. */
const ADJACENT: string[][] = [
  ["PostgreSQL", "MySQL", "SQL Server", "Oracle Database", "SQLite"],
  ["AWS", "Microsoft Azure", "Google Cloud Platform"],
  ["React", "Vue.js", "Angular", "Svelte", "Next.js", "Nuxt"],
  ["Apache Kafka", "RabbitMQ", "Amazon SQS"],
  ["Jest", "Vitest", "Mocha"],
  ["Cypress", "Playwright", "Selenium"],
  ["Terraform", "Pulumi", "CloudFormation", "Ansible"],
  ["Jenkins", "GitHub Actions", "GitLab CI", "CircleCI", "Azure DevOps"],
  ["Java", "C#", "Kotlin", "Scala"],
  ["Spring Boot", ".NET", "Django", "Express.js", "NestJS", "FastAPI", "Flask", "Ruby on Rails", "Laravel"],
  ["Tableau", "Power BI", "Looker"],
  ["Snowflake", "BigQuery", "Amazon Redshift", "Databricks"],
  ["PyTorch", "TensorFlow"],
  ["Datadog", "New Relic", "Prometheus", "Grafana", "Splunk"],
  ["React Native", "Flutter"],
  ["MongoDB", "DynamoDB", "Cassandra", "Firebase"],
  ["LangChain", "LlamaIndex"],
  ["OpenAI API", "Anthropic Claude API"],
  ["Docker", "Kubernetes"],
  ["JavaScript", "TypeScript"],
  ["Python", "Ruby", "PHP"],
  ["C", "C++"],
  ["Scrum", "Agile", "Kanban"],
];

const LEARN_HOURS: Partial<Record<SkillCategory, string>> = {
  language: "20–40",
  frontend: "8–20",
  backend: "8–20",
  mobile: "20–40",
  database: "6–12",
  cloud: "10–25",
  devops: "8–20",
  data: "8–20",
  ml_ai: "10–30",
  testing: "4–10",
  security: "10–25",
  architecture: "15–40",
  practice: "2–6",
  tool: "2–6",
};

const SECTION_ORDERS: Record<string, string[]> = {
  student: ["summary", "education", "skills", "projects", "experience", "certifications", "extras"],
  new_grad: ["summary", "skills", "projects", "experience", "education", "certifications", "extras"],
  career_switcher: ["summary", "skills", "projects", "experience", "certifications", "education", "extras"],
  returning: ["summary", "skills", "experience", "projects", "certifications", "education", "extras"],
  default: ["summary", "skills", "experience", "projects", "education", "certifications", "extras"],
};

function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !isStopword(w)),
  );
}

export function analyzeGaps(
  jd: JDAnalysis,
  candidate: { resume_text: string; linkedin_text?: string; additional_context?: string; career_stage?: string; years_of_experience?: number },
  jdText: string,
): GapAnalysis {
  const resumeHits = findSkills(candidate.resume_text);
  const liHits = findSkills(candidate.linkedin_text ?? "");
  const ctxHits = findSkills(candidate.additional_context ?? "");
  const candidateSkills = new Set([...resumeHits.keys(), ...liHits.keys(), ...ctxHits.keys()]);

  const matched: GapAnalysis["matched"] = [];
  const gaps: GapItem[] = [];
  let totalW = 0;
  let matchedW = 0;

  for (const k of jd.keywords) {
    totalW += k.weight;
    if (resumeHits.has(k.skill)) {
      matchedW += k.weight;
      matched.push({ skill: k.skill, importance: k.importance, write_as: k.write_as });
      continue;
    }
    const base = { skill: k.skill, importance: k.importance, weight: k.weight, write_as: k.write_as };
    if (liHits.has(k.skill) || ctxHits.has(k.skill)) {
      const where = liHits.has(k.skill) ? "LinkedIn" : "notes";
      const learning = isLearningMention(k.skill, `${candidate.linkedin_text ?? ""}\n${candidate.additional_context ?? ""}`);
      gaps.push({
        ...base,
        strategy: "surface",
        learning,
        reason: learning
          ? `Your ${where} says you're learning ${k.skill}. Confirm the level. Building a bridge project in ${k.skill} turns "learning" into a shipped, listable skill.`
          : `Already on your ${where} but missing from the resume. Add it with a concrete bullet.`,
      });
      continue;
    }
    const via = impliedBy(k.skill, candidateSkills);
    if (via.length) {
      gaps.push({ ...base, strategy: "surface", reason: `Implied by your ${via.join(", ")} experience, but ATS matches literally. Write "${k.write_as}" explicitly in Skills and in the bullet that uses ${via[0]}.` });
      continue;
    }
    if (k.category === "soft_skill") {
      gaps.push({ ...base, strategy: "reframe", reason: "Soft skills are shown through bullets, not listed. Rewrite an existing bullet to demonstrate it (e.g. 'partnered with…', 'led…')." });
      continue;
    }
    const related = ADJACENT.find((g) => g.includes(k.skill))?.filter((s) => s !== k.skill && candidateSkills.has(s)) ?? [];
    if (related.length) {
      gaps.push({
        ...base,
        strategy: "reframe",
        related_skills_you_have: related,
        reason: `You have ${related.join(", ")}, which transfers directly. Ask whether they've touched ${k.skill}. If not, a weekend of hands-on use in a bridge project makes it honest to list.`,
        quick_learn_hours: LEARN_HOURS[k.category],
      });
      continue;
    }
    if (!HARD_CATEGORIES.has(k.category)) {
      gaps.push({ ...base, strategy: "ask_candidate", reason: "Commonly done but rarely listed. Ask the candidate for a real example before adding it." });
      continue;
    }
    gaps.push({
      ...base,
      strategy: k.importance === "nice_to_have" ? "quick_learn" : "bridge_project",
      reason:
        k.importance === "nice_to_have"
          ? `Nice-to-have. Roughly ${LEARN_HOURS[k.category] ?? "5–15"} hours to working proficiency. Ask first whether they've used it at all.`
          : `Must-have with no evidence yet. Ask the candidate first; if there's truly none, close it with a bridge project (below) before applying.`,
      quick_learn_hours: LEARN_HOURS[k.category],
    });
  }

  gaps.sort((a, b) => b.weight - a.weight);

  // Evidence map — which of the candidate's existing lines best prove each focus point.
  const lines = unique(
    [...toLines(candidate.resume_text), ...toLines(candidate.linkedin_text ?? ""), ...toLines(candidate.additional_context ?? "")].filter(isEvidenceLine),
  );
  const lineMeta = lines.map((line) => {
    const hits = findSkills(line);
    return {
      line,
      words: contentWords(line),
      skills: new Set(hits.keys()),
      categories: new Set([...hits.values()].map((h) => h.skill.category)),
      learning: LEARNING_RE.test(line),
    };
  });
  const evidence_map: EvidenceLink[] = jd.focus_points.slice(0, 8).map((fp) => {
    const fpWords = contentWords(fp.statement);
    const fpCats = new Set(jd.keywords.filter((k) => fp.skills.includes(k.skill) && HARD_CATEGORIES.has(k.category)).map((k) => k.category));
    const scored = lineMeta
      .filter((m) => !m.learning) // "currently learning X" isn't evidence of doing X
      .map((m) => {
        const skillOverlap = fp.skills.filter((s) => m.skills.has(s));
        const wordOverlap = [...fpWords].filter((w) => m.words.has(w));
        // Same-category tools are transferable evidence (Jenkins → CI/CD, MySQL → PostgreSQL).
        const catOverlap = [...fpCats].filter((c) => m.categories.has(c)).length;
        return {
          line: m.line,
          overlap: unique([...skillOverlap, ...wordOverlap]).slice(0, 8),
          score: skillOverlap.length * 3 + catOverlap * 1.5 + wordOverlap.length,
        };
      })
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return {
      focus_point: fp.statement,
      best_matching_lines: scored.map(({ line, overlap }) => ({ line, overlap })),
      guidance: scored.length
        ? "Rewrite the matching line(s) to lead with this focus point's language and skills, and add a measurable result."
        : "No existing evidence. Ask the candidate for a real example, or cover it with a bridge project.",
    };
  });

  const hardMust = jd.keywords.filter((k) => k.importance === "must_have" && HARD_CATEGORIES.has(k.category));
  const hardMatchRatio = hardMust.length ? hardMust.filter((k) => candidateSkills.has(k.skill)).length / hardMust.length : 1;

  const years = candidate.years_of_experience ?? estimateYearsOfExperience(candidate.resume_text);
  let stage = candidate.career_stage;
  if (!stage) {
    const techRole = !["general_professional", "product_management", "design"].includes(jd.role_family);
    const resumeHard = [...resumeHits.values()].filter((h) => HARD_CATEGORIES.has(h.skill.category)).length;
    if (techRole && (years ?? 0) >= 2 && resumeHard < 3) stage = "career_switcher";
    else if (years === null || years < 1) stage = "new_grad";
    else if (years < 3) stage = "early_career";
    else if (years < 7) stage = "mid_career";
    else stage = "senior";
  }

  const bridge_projects = suggestBridgeProjects({
    gaps: gaps
      .filter((g) => g.strategy === "bridge_project" || g.strategy === "quick_learn" || g.strategy === "reframe" || g.learning)
      .filter((g) => jd.keywords.find((k) => k.skill === g.skill && HARD_CATEGORIES.has(k.category)))
      .map((g) => ({ skill: g.skill, weight: g.weight })),
    candidate_skills: [...candidateSkills],
    jd_text: jdText,
    company: jd.company,
    max_projects: stage === "career_switcher" || stage === "new_grad" || stage === "student" ? 3 : 2,
  });

  const mustTotal = jd.keywords.filter((k) => k.importance === "must_have").length;
  const mustMatched = matched.filter((m) => m.importance === "must_have").length;
  const experienceGap = jd.years_required && years !== null ? Math.max(0, Math.round((jd.years_required - years) * 10) / 10) : 0;

  const notes: string[] = [];
  if (experienceGap > 0) {
    notes.push(
      `The JD asks for ${jd.years_required}+ years and the candidate has about ${years}. Don't inflate dates. Close the gap with scope instead: ownership, scale, impact numbers, and relevant internships, freelance or open-source work (these count as experience when they're real).`,
    );
  }
  if (jd.education.length) notes.push(`Education requirement detected: "${jd.education[0]}". Mirror the degree wording exactly if it's met; if not, lead with equivalent experience and certifications.`);
  if (jd.certifications.length) notes.push(`Certifications named in the JD: ${jd.certifications.join(", ")}. If one is in progress, list it as "(In Progress, expected <month year>)".`);
  notes.push("Mirror the JD title in the headline and summary. Put the top 8–12 must-have keywords in the Skills section and repeat each one naturally in at least one bullet.");
  notes.push(...jd.implied_expectations);

  const skillsOrder = unique(jd.keywords.filter((k) => HARD_CATEGORIES.has(k.category)).map((k) => CATEGORY_LABELS[k.category])).slice(0, 6);

  const learning = new Set(gaps.filter((g) => g.learning).map((g) => g.skill));
  for (const s of candidateSkills) if (isLearningMention(s, `${candidate.linkedin_text ?? ""}\n${candidate.additional_context ?? ""}`)) learning.add(s);
  const other = new Map([...liHits, ...ctxHits]);
  const skills_section_draft = draftSkillsSection(jd, { resume: resumeHits, other }, learning);
  const title_translations = translateTitles(professionalRoles(candidate.resume_text), jd.title);
  const experience_promotions = findHiddenExperience(candidate);
  const quick_win_certifications = suggestQuickCerts(
    jd,
    gaps.filter((g) => g.strategy !== "surface" || g.learning).map((g) => ({ skill: g.skill, weight: g.weight })),
    `${candidate.resume_text}\n${candidate.linkedin_text ?? ""}`,
  );

  const questions: string[] = [];
  const askable = gaps
    .filter((g) => g.strategy !== "surface" && g.importance !== "contextual")
    .filter((g) => jd.keywords.find((k) => k.skill === g.skill)?.category !== "soft_skill")
    .slice(0, 8);
  if (askable.length) {
    questions.push(
      `Have you used any of these, even briefly (coursework, side projects, internal tools, one sprint)? ${askable.map((g) => g.skill).join(", ")}. Say yes/no for each and give one example for the yeses.`,
    );
  }
  if (evidence_map.some((e) => !e.best_matching_lines.length)) {
    questions.push("For the JD focus points with no matching evidence (see evidence_map), do you have any real example, even a small one?");
  }
  questions.push("For your top 3 accomplishments, what changed because of your work? Numbers help: % faster, $ saved, users, requests/sec, hours saved, error rate.");
  if (experience_promotions.length) {
    questions.push(`These look like real experience that isn't listed as a role yet: ${experience_promotions.slice(0, 3).map((e) => `"${e.evidence.slice(0, 60)}…"`).join("; ")}. What were the organization and dates for each?`);
  }
  if (quick_win_certifications.length) {
    questions.push(`Would you start one of these quick certifications now? It can go on the resume as "In Progress": ${quick_win_certifications.map((c) => `${c.name} (${c.prep.split(" (")[0]})`).join("; ")}.`);
  }
  if (bridge_projects.length) {
    questions.push(`Would you build ${bridge_projects.length === 1 ? "this bridge project" : "one of these bridge projects"} before applying (${bridge_projects.map((p) => p.name).join("; ")})? I'll list it as "In Progress" until it's done.`);
  }

  return {
    baseline_keyword_coverage: totalW ? Math.round((matchedW / totalW) * 100) : 0,
    must_have_coverage: `${mustMatched}/${mustTotal}`,
    matched,
    gaps,
    evidence_map,
    bridge_projects,
    candidate_profile: {
      years_experience: years,
      years_required: jd.years_required,
      experience_gap_years: experienceGap,
      career_stage: stage,
      hard_skill_match_ratio: Math.round(hardMatchRatio * 100) / 100,
    },
    resume_plan: {
      headline: jd.title ?? "Mirror the exact job title from the posting",
      section_order: SECTION_ORDERS[stage] ?? SECTION_ORDERS.default,
      summary_formula:
        "[JD title] with [N years / background] in [top 2 JD domains]. Built/shipped [most relevant proof with a metric] using [3–4 must-have skills]. Brings [1 differentiator tied to a JD focus point]. 2–3 lines, no clichés, no 'I'.",
      skills_section_order: skillsOrder,
      skills_section_draft,
      title_translations,
      experience_promotions,
      notes,
    },
    quick_win_certifications,
    questions_for_candidate: questions,
  };
}
