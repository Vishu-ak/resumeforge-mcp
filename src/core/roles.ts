import { extractDateRanges, totalMonths } from "./dates.js";
import { detectHeading, type ResumeSectionKey } from "./resumeParse.js";
import { findSkills } from "./skills.js";
import { normalizeWhitespace } from "./text.js";

export interface ParsedRole {
  title: string;
  company: string;
  start: Date;
  end: Date;
  current: boolean;
  dates: string;
  section: ResumeSectionKey;
  /** Everything written under this role (title line + bullets). */
  text: string;
}

const TITLE_WORDS =
  /\b(engineer|developer|programmer|architect|scientist|analyst|manager|designer|lead|intern|specialist|consultant|administrator|associate|director|coordinator|officer|staff|trainee|assistant|researcher|fellow|founder|contractor|freelancer|sde|swe|mts)\b/i;

function splitTitleCompany(line: string): { title: string; company: string } {
  const parts = line
    .split(/\s*[|•·–—]\s*|\s+-\s+|\s+at\s+|\s*,\s*|\s+@\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(remote|hybrid|on-?site)$/i.test(p));
  if (!parts.length) return { title: "", company: "" };
  const ti = parts.findIndex((p) => TITLE_WORDS.test(p));
  if (ti === -1) return { title: parts[0], company: parts[1] ?? "" };
  const company = parts.find((p, i) => i !== ti && !TITLE_WORDS.test(p)) ?? "";
  return { title: parts[ti], company };
}

/** Roles with dates, tagged by the resume section they appear in. */
export function parseRoles(resumeText: string, now = new Date()): ParsedRole[] {
  const text = normalizeWhitespace(resumeText);
  const lines = text.split("\n");
  const sectionAt: ResumeSectionKey[] = [];
  let current: ResumeSectionKey = "header";
  for (const l of lines) {
    const h = detectHeading(l);
    if (h) current = h;
    sectionAt.push(current);
  }
  const ranges = extractDateRanges(text, now);
  return ranges.map((r, i) => {
    const titleLine = r.sourceLine === lines[r.lineIndex]?.trim() ? r.lineIndex : Math.max(0, r.lineIndex - 1);
    const nextStart = ranges[i + 1] ? (ranges[i + 1].sourceLine === lines[ranges[i + 1].lineIndex]?.trim() ? ranges[i + 1].lineIndex : ranges[i + 1].lineIndex - 1) : lines.length;
    let endLine = nextStart;
    for (let j = r.lineIndex + 1; j < nextStart; j++) {
      if (detectHeading(lines[j])) {
        endLine = j;
        break;
      }
    }
    const { title, company } = splitTitleCompany(r.sourceLine.replace(r.raw, ""));
    return {
      title,
      company,
      start: r.start,
      end: r.end,
      current: r.current,
      dates: r.raw,
      section: sectionAt[r.lineIndex],
      text: lines.slice(titleLine, endLine).join("\n"),
    };
  });
}

/** Professional roles: those under Experience, or all non-education roles if there are no headings. */
export function professionalRoles(resumeText: string, now = new Date()): ParsedRole[] {
  const roles = parseRoles(resumeText, now);
  const inExp = roles.filter((r) => r.section === "experience");
  if (inExp.length) return inExp;
  return roles.filter((r) => r.section !== "education" && !/\b(university|college|school|institute|b\.?tech|bachelor|master|degree)\b/i.test(r.text.split("\n")[0]));
}

export interface SkillYears {
  skill: string;
  years: number;
  label: string;
  basis: string[];
}

/**
 * Honest "years of experience with X" for application forms: the union of
 * role date ranges whose text mentions the skill. Rounded DOWN to 0.5 years.
 */
export function yearsWithSkill(resumeText: string, skills: string[], now = new Date()): SkillYears[] {
  const roles = professionalRoles(resumeText, now);
  return skills.map((skill) => {
    const using = roles.filter((r) => findSkills(r.text).has(skill));
    const months = totalMonths(using);
    const years = Math.floor(months / 6) / 2;
    return {
      skill,
      years,
      label: years >= 1 ? `${years} years` : using.length ? "Less than 1 year" : "No professional use listed (projects/coursework only, if any)",
      basis: using.map((r) => `${r.title || "Role"}${r.company ? ` @ ${r.company}` : ""} (${r.dates})`),
    };
  });
}

const HIDDEN_EXPERIENCE: { re: RegExp; kind: string; title: string }[] = [
  { re: /\bintern(ship)?\b/i, kind: "internship", title: "Software Engineering Intern" },
  { re: /\bfreelanc(e|er|ing)\b|\bcontract(or)? (work|developer|engineer)\b|\bupwork\b|\bfiverr\b/i, kind: "freelance", title: "Freelance Software Engineer" },
  { re: /\bopen[- ]source\b|\bcontribut(or|ed|ions?) to\b|\bmerged (pull requests|prs)\b/i, kind: "open_source", title: "Open Source Contributor" },
  { re: /\bteaching assistant\b|\b(ta|grader) for\b/i, kind: "teaching", title: "Teaching Assistant" },
  { re: /\bresearch (assistant|intern|project)\b|\bresearch lab\b|\bpublished (a |an )?(paper|research|article)/i, kind: "research", title: "Research Assistant" },
  { re: /\bhackathon\b/i, kind: "hackathon", title: "Hackathon Participant / Winner" },
  { re: /\bvolunteer(ed|ing)?\b/i, kind: "volunteer", title: "Volunteer Software Developer" },
  { re: /\bfounder\b|\bco-?founded\b|\bstartup\b|\bside business\b/i, kind: "founder", title: "Founder" },
];

export interface ExperiencePromotion {
  kind: string;
  evidence: string;
  suggested_entry: string;
  why: string;
}

/**
 * Real experience that's buried (in projects, notes or LinkedIn) and could be
 * its own Experience entry. Recruiters and ATS both count it.
 */
export function findHiddenExperience(sources: { resume_text: string; linkedin_text?: string; additional_context?: string }): ExperiencePromotion[] {
  const roles = professionalRoles(sources.resume_text);
  const expText = roles.map((r) => r.text).join("\n").toLowerCase();
  const lines = [sources.resume_text, sources.linkedin_text ?? "", sources.additional_context ?? ""]
    .join("\n")
    .split(/\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.split(/\s+/).length >= 3);
  const out: ExperiencePromotion[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    for (const h of HIDDEN_EXPERIENCE) {
      if (!h.re.test(l) || expText.includes(l.toLowerCase().slice(0, 40))) continue;
      if (/\blearning\b|\bplan(ning)? to\b/i.test(l)) continue;
      const key = `${h.kind}:${l.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: h.kind,
        evidence: l.slice(0, 200),
        suggested_entry: `${h.title} | <Organization / Project> | <Start – End>`,
        why: "Real, dated work counts as experience. Give it its own Experience entry with 2–3 quantified bullets instead of burying it.",
      });
    }
  }
  return out.slice(0, 8);
}
