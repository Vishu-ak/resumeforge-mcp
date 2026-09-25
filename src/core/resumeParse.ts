import { extractDateRanges, totalMonths } from "./dates.js";
import { normalizeWhitespace } from "./text.js";

export type ResumeSectionKey =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "other";

const HEADING_MAP: [ResumeSectionKey, RegExp][] = [
  ["summary", /^(professional\s+)?(summary|profile|objective|about( me)?|career objective|overview)$/i],
  ["skills", /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tech stack|expertise|toolkit)( & tools| and tools)?$/i],
  ["experience", /^(professional\s+|work\s+|relevant\s+)?(experience|employment( history)?|work history|career history)$/i],
  ["projects", /^(personal\s+|academic\s+|selected\s+|key\s+)?projects?$/i],
  ["education", /^(education|academics?|academic background|qualifications)$/i],
  ["certifications", /^(certifications?|licenses?( & certifications)?|certificates?|courses?( & certifications)?)$/i],
  ["other", /^(awards?|honors?|achievements?|publications?|volunteer(ing)?( experience)?|leadership|activities|interests|languages|extracurriculars?)$/i],
];

export function detectHeading(line: string): ResumeSectionKey | null {
  const t = line.replace(/[:#*_=|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 45) return null;
  for (const [key, re] of HEADING_MAP) if (re.test(t)) return key;
  return null;
}

export function splitResumeSections(text: string): Record<ResumeSectionKey, string> {
  const out: Record<ResumeSectionKey, string[]> = {
    header: [], summary: [], skills: [], experience: [], projects: [], education: [], certifications: [], other: [],
  };
  let current: ResumeSectionKey = "header";
  for (const line of normalizeWhitespace(text).split("\n")) {
    const h = detectHeading(line);
    if (h) {
      current = h;
      continue;
    }
    out[current].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()])) as Record<ResumeSectionKey, string>;
}

/** Estimated professional experience in years (education and projects excluded). */
export function estimateYearsOfExperience(resumeText: string, now = new Date()): number | null {
  const sections = splitResumeSections(resumeText);
  let ranges = extractDateRanges(sections.experience, now);
  if (!ranges.length && !sections.experience) {
    // No headings detected — fall back to every range that isn't obviously education.
    ranges = extractDateRanges(resumeText, now).filter(
      (r) => !/\b(university|college|school|institute|bachelor|master|b\.?tech|b\.?s|m\.?s|degree|gpa)\b/i.test(r.context),
    );
  }
  if (!ranges.length) return null;
  return Math.round((totalMonths(ranges) / 12) * 10) / 10;
}

export function extractContactSignals(text: string) {
  return {
    email: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null,
    phone: text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? null,
    linkedin: text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i)?.[0] ?? null,
    github: text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i)?.[0] ?? null,
  };
}
