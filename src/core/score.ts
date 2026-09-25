import { CLICHES, WEAK_PHRASES, isActionVerb } from "../data/verbs.js";
import { bulletSource, bulletText, type Resume } from "../schemas.js";
import { analyzeJobDescription, type JDAnalysis } from "./jd.js";
import { splitResumeSections } from "./resumeParse.js";
import { allBullets, resumeToText } from "./resumeText.js";
import { findSkills, withImplied } from "./skills.js";
import { unique } from "./text.js";

export interface ScoreComponent {
  score: number;
  max: number;
  detail: string;
}

export interface ATSScore {
  total: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  verdict: string;
  components: Record<string, ScoreComponent>;
  missing_must_have: { skill: string; write_as: string }[];
  missing_nice_to_have: string[];
  keywords_only_in_skills_list: string[];
  overused_keywords: string[];
  blockers: string[];
  top_fixes: string[];
  truth_check?: {
    unverified_claims: { where: string; text: string; skills_not_in_sources: string[] }[];
    guidance: string;
  };
}

export interface CandidateSources {
  original_resume_text?: string;
  linkedin_text?: string;
  additional_context?: string;
  /** Skills the candidate explicitly confirmed in chat. */
  confirmed_skills?: string[];
}

const METRIC_RE = /(\d+(\.\d+)?\s?(%|x|k|m|b|ms|s|hrs?|hours|mins?|minutes|days|weeks|users|customers|req|rps|qps|tps|\+))|(\$\s?\d)|(\d{2,})/i;
const PLACEHOLDER_RE = /\[(N|X|Y|metric|insight|link|project|fix\/feature|issue|number|company|skill|tool)\]/i;

function gradeFor(total: number): ATSScore["grade"] {
  if (total >= 90) return "A+";
  if (total >= 80) return "A";
  if (total >= 70) return "B";
  if (total >= 55) return "C";
  return "D";
}

function titleTokens(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9+#/ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(i|ii|iii|iv|the|and|of|for|with|remote|hybrid|us|usa)$/.test(w));
}

export function scoreResume(
  input: { resume?: Resume; resume_text?: string },
  jdText: string,
  sources?: CandidateSources,
  jdAnalysis?: JDAnalysis,
): ATSScore {
  const jd = jdAnalysis ?? analyzeJobDescription(jdText);
  const r = input.resume;
  const text = r ? resumeToText(r) : (input.resume_text ?? "");
  const sections = splitResumeSections(text);
  const hits = findSkills(text);
  const blockers: string[] = [];
  const fixes: { impact: number; text: string }[] = [];
  const C: Record<string, ScoreComponent> = {};

  // 1. Keyword coverage (45)
  const total = jd.keywords.reduce((a, k) => a + k.weight, 0) || 1;
  const got = jd.keywords.filter((k) => hits.has(k.skill)).reduce((a, k) => a + k.weight, 0);
  const cov = got / total;
  const missingMust = jd.keywords.filter((k) => k.importance === "must_have" && !hits.has(k.skill));
  const missingNice = jd.keywords.filter((k) => k.importance === "nice_to_have" && !hits.has(k.skill)).map((k) => k.skill);
  const kwScore = Math.round(Math.min(1, cov / 0.85) * 45);
  C.keyword_match = { score: kwScore, max: 45, detail: `${Math.round(cov * 100)}% of weighted JD keywords present; ${missingMust.length} must-have(s) missing.` };
  if (missingMust.length) {
    fixes.push({ impact: 10, text: `Add missing must-have keywords (only where truthful): ${missingMust.slice(0, 8).map((k) => k.write_as).join(", ")}.` });
  }

  // 2. Keyword placement — skills should also appear in experience/project context (10)
  const bulletBlob = r ? allBullets(r).map((b) => bulletText(b.bullet)).join("\n") : `${sections.experience}\n${sections.projects}`;
  const bulletHits = findSkills(bulletBlob);
  const presentMust = jd.keywords.filter((k) => k.importance === "must_have" && hits.has(k.skill) && k.category !== "soft_skill");
  const onlyInSkills = presentMust.filter((k) => !bulletHits.has(k.skill)).map((k) => k.skill);
  const placement = presentMust.length ? 1 - onlyInSkills.length / presentMust.length : 0;
  C.keyword_context = { score: Math.round(placement * 10), max: 10, detail: `${presentMust.length - onlyInSkills.length}/${presentMust.length} must-have skills are backed by a bullet (not only listed).` };
  if (onlyInSkills.length) {
    fixes.push({ impact: 6, text: `These skills are only listed and never shown in use. Work each into a real bullet: ${onlyInSkills.slice(0, 6).join(", ")}.` });
  }

  // 3. Title alignment (8)
  const head = r ? `${r.basics.headline ?? ""} ${r.summary ?? ""}` : text.split("\n").slice(0, 8).join(" ") + " " + sections.summary;
  let titleScore = 8;
  if (jd.title) {
    const want = titleTokens(jd.title);
    const have = new Set(titleTokens(head));
    const overlap = want.filter((w) => have.has(w)).length / (want.length || 1);
    titleScore = Math.round(Math.min(1, overlap / 0.8) * 8);
    if (overlap < 0.8) fixes.push({ impact: 5, text: `Mirror the job title "${jd.title}" in the headline under your name and in the first line of the summary.` });
  }
  C.title_alignment = { score: titleScore, max: 8, detail: jd.title ? `JD title: "${jd.title}".` : "No JD title detected." };

  // 4. Bullet quality (15)
  const bullets = r
    ? allBullets(r).map((b) => bulletText(b.bullet))
    : text.split("\n").filter((l) => /^\s*([-*•●▪]|\d+\.)\s+/.test(l)).map((l) => l.replace(/^\s*([-*•●▪]|\d+\.)\s+/, ""));
  const n = bullets.length || 1;
  const verbFirst = bullets.filter((b) => isActionVerb(b.split(/\s+/)[0])).length;
  const metric = bullets.filter((b) => METRIC_RE.test(b)).length;
  const weak = bullets.filter((b) => WEAK_PHRASES.some((p) => b.toLowerCase().includes(p)));
  const lengths = bullets.map((b) => b.split(/\s+/).length);
  const goodLen = lengths.filter((l) => l >= 10 && l <= 32).length;
  const bq = bullets.length ? (verbFirst / n) * 5 + Math.min(1, metric / n / 0.6) * 6 + (goodLen / n) * 3 + (weak.length ? 0 : 1) : 0;
  C.bullet_quality = {
    score: Math.round(bq),
    max: 15,
    detail: `${bullets.length} bullets: ${Math.round((verbFirst / n) * 100)}% start with a strong verb, ${Math.round((metric / n) * 100)}% quantified, ${weak.length} use weak phrasing.`,
  };
  if (metric / n < 0.6) fixes.push({ impact: 7, text: `Quantify more bullets (${metric}/${bullets.length} have numbers). Aim for 60%+ with %, $, time saved, scale, or latency.` });
  if (verbFirst / n < 0.8) fixes.push({ impact: 4, text: "Start every bullet with a strong past-tense action verb (Built, Led, Reduced, Designed…)." });
  if (weak.length) fixes.push({ impact: 3, text: `Replace weak phrasing ("responsible for", "worked on", "helped with") in: "${weak[0].slice(0, 70)}…"` });

  // 5. Structure & parseability (10)
  let struct = 10;
  const structIssues: string[] = [];
  const email = r?.basics.email ?? text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const linkedin = r?.basics.linkedin ?? text.match(/linkedin\.com\/in\//i)?.[0];
  if (!email) { struct -= 3; blockers.push("No email address."); }
  if (!linkedin) { struct -= 2; blockers.push("No LinkedIn URL. Recruiters check it immediately."); }
  if (!(r?.basics.phone ?? text.match(/\+?\d[\d\s().-]{7,}\d/))) { struct -= 1; structIssues.push("no phone"); }
  if (!sections.experience && !sections.projects && !(r && (r.experience.length || r.projects.length))) { struct -= 3; structIssues.push("no Experience/Projects section"); }
  if (!sections.education && !(r && r.education.length)) { struct -= 1; structIssues.push("no Education section"); }
  if (/[│┃┆┊╎║■◆★✓✔➤►▶]|\t{2,}/.test(text)) { struct -= 1; structIssues.push("special symbols/tabs that some ATS mangle"); }
  if (r) {
    const thin = r.experience.filter((e) => e.bullets.length < 2).map((e) => e.company);
    const heavy = r.experience.filter((e) => e.bullets.length > 7).map((e) => e.company);
    if (thin.length) structIssues.push(`roles with <2 bullets: ${thin.join(", ")}`);
    if (heavy.length) structIssues.push(`roles with >7 bullets: ${heavy.join(", ")}`);
  }
  C.structure = { score: Math.max(0, struct), max: 10, detail: structIssues.length ? `Issues: ${structIssues.join("; ")}.` : "Standard headings, contact info complete, single-column text." };

  // 6. Length (5)
  const words = text.split(/\s+/).filter(Boolean).length;
  const yrs = jd.years_required ?? 0;
  const [lo, hi] = yrs >= 8 ? [550, 1100] : [380, 800];
  const lenScore = words < lo ? Math.round((words / lo) * 5) : words > hi ? Math.max(1, 5 - Math.ceil((words - hi) / 120)) : 5;
  C.length = { score: lenScore, max: 5, detail: `${words} words (target ${lo}–${hi}${hi <= 800 ? ", one page" : ", up to two pages"}).` };
  if (words > hi) fixes.push({ impact: 3, text: `Trim to about ${hi} words: cut bullets that don't map to a JD focus point.` });
  if (words < lo) fixes.push({ impact: 3, text: `Too thin (${words} words). Add projects or bullets that prove JD focus points.` });

  // 7. Integrity & polish (7)
  let integ = 7;
  const placeholders = unique((text.match(new RegExp(PLACEHOLDER_RE.source, "gi")) ?? []).map((s) => s));
  if (placeholders.length) {
    integ -= 4;
    blockers.push(`Unfilled placeholders ${placeholders.slice(0, 5).join(", ")}. Replace them with real numbers or reword the line.`);
  }
  const lower = text.toLowerCase();
  const cliches = CLICHES.filter((c) => lower.includes(c));
  if (cliches.length) {
    integ -= 1;
    fixes.push({ impact: 2, text: `Remove clichés recruiters skip: ${cliches.join(", ")}.` });
  }
  const overused = [...hits.values()].filter((h) => h.count > 7).map((h) => h.skill.name);
  if (overused.length) {
    integ -= 1;
    fixes.push({ impact: 2, text: `Possible keyword stuffing (7+ mentions): ${overused.join(", ")}. Modern ATS and humans both penalize it.` });
  }

  let truth_check: ATSScore["truth_check"];
  if (r && sources) {
    const srcText = [sources.original_resume_text, sources.linkedin_text, sources.additional_context].filter(Boolean).join("\n");
    const srcSkills = withImplied([...findSkills(srcText).keys(), ...(sources.confirmed_skills ?? []).map((s) => findSkills(s).keys().next().value ?? s)]);
    const unverified: NonNullable<ATSScore["truth_check"]>["unverified_claims"] = [];
    for (const b of allBullets(r)) {
      const src = bulletSource(b.bullet);
      if (src === "bridge_project" || src === "candidate_confirmed") continue;
      if (b.kind === "project" && b.status === "in_progress") continue;
      const missing = [...findSkills(bulletText(b.bullet)).keys()].filter((s) => !srcSkills.has(s));
      if (missing.length) unverified.push({ where: b.where, text: bulletText(b.bullet), skills_not_in_sources: missing });
    }
    const skillListUnverified = r.skills.flatMap((s) => s.items).flatMap((i) => [...findSkills(i).keys()]).filter((s) => !srcSkills.has(s));
    const projectSkills = new Set(r.projects.flatMap((p) => [...p.tech, ...p.bullets.map(bulletText)]).flatMap((t) => [...findSkills(t).keys()]));
    const orphanSkills = unique(skillListUnverified.filter((s) => !projectSkills.has(s)));
    if (orphanSkills.length) {
      unverified.push({ where: "Skills section", text: orphanSkills.join(", "), skills_not_in_sources: orphanSkills });
    }
    if (unverified.length) integ -= Math.min(2, unverified.length);
    truth_check = {
      unverified_claims: unverified,
      guidance: unverified.length
        ? "Confirm each of these with the candidate before rendering. For a yes, mark the bullet source 'candidate_confirmed' and pass the skill in confirmed_skills. For a no, remove it or move it to a bridge project marked In Progress."
        : "Every skill claim traces back to the candidate's resume, LinkedIn, notes, confirmations, or a bridge project.",
    };
  }
  C.integrity = { score: Math.max(0, integ), max: 7, detail: placeholders.length ? "Placeholders remain." : "No placeholders." };

  const totalScore = Object.values(C).reduce((a, c) => a + c.score, 0);
  const grade = gradeFor(totalScore);
  const verdict =
    totalScore >= 85
      ? "Strong match: likely to clear ATS keyword screens and read well to a recruiter."
      : totalScore >= 70
        ? "Competitive, but fix the top items below to reach the top tier of applicants."
        : totalScore >= 55
          ? "Borderline: likely filtered out by keyword-ranked ATS. Apply the fixes and re-score."
          : "Weak match for this JD. Close must-have gaps (bridge projects) before applying.";

  return {
    total: totalScore,
    grade,
    verdict,
    components: C,
    missing_must_have: missingMust.map((k) => ({ skill: k.skill, write_as: k.write_as })),
    missing_nice_to_have: missingNice,
    keywords_only_in_skills_list: onlyInSkills,
    overused_keywords: overused,
    blockers,
    top_fixes: fixes.sort((a, b) => b.impact - a.impact).map((f) => f.text).slice(0, 8),
    ...(truth_check ? { truth_check } : {}),
  };
}
