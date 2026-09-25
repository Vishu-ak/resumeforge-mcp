import type { CandidateProfile } from "../schemas.js";
import { extractDateRanges } from "./dates.js";
import { estimateYearsOfExperience, extractContactSignals, splitResumeSections } from "./resumeParse.js";
import { findSkills } from "./skills.js";

export interface IntakeResult {
  ready: boolean;
  missing_required: string[];
  errors: string[];
  warnings: string[];
  linkedin: {
    url_valid: boolean;
    normalized_url: string | null;
    profile_text_provided: boolean;
    /** Skills listed on LinkedIn but missing from the resume — free, already-public wins. */
    skills_on_linkedin_not_resume: string[];
    /** Roles on the resume that don't appear on LinkedIn (recruiters notice). */
    resume_roles_missing_on_linkedin: string[];
    linkedin_roles_missing_on_resume: string[];
    name_matches: boolean | null;
  };
  snapshot: {
    estimated_years_experience: number | null;
    inferred_career_stage: string;
    detected_skills: string[];
    sections_found: string[];
    resume_word_count: number;
  };
  questions_to_ask: string[];
  next_step: string;
}

const LINKEDIN_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9_%\-À-ɏ]{3,100})\/?(?:\?.*)?$/i;
const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function normalizeLinkedIn(url: string): string | null {
  const m = url.trim().match(LINKEDIN_RE);
  return m ? `https://www.linkedin.com/in/${m[1].replace(/\/$/, "")}` : null;
}

const GENERIC_ROLE_WORDS =
  /^(present|current|remote|hybrid|onsite|full|time|part|contract|inc|llc|ltd|pvt|the|and|software|engineer|engineering|developer|senior|junior|lead|staff|principal|manager|intern|internship|analyst|associate|consultant|architect|specialist|director|head|ii|iii|iv|sr|jr|stack|backend|frontend|data|scientist|product|designer|qa|test|devops|cloud|mobile|web|member|technical)$/i;

/** Company-identifying words in a role line (generic title words removed), for fuzzy cross-matching. */
function roleTokens(context: string): string[] {
  return context
    .split(/[^A-Za-z0-9&.+#]+/)
    .filter((w) => w.length > 2 && /^[A-Z0-9]/.test(w))
    .filter((w) => !GENERIC_ROLE_WORDS.test(w));
}

function crossMissing(fromText: string, inText: string): string[] {
  const inLower = inText.toLowerCase();
  const missing: string[] = [];
  for (const r of extractDateRanges(fromText)) {
    const toks = roleTokens(r.context);
    if (!toks.length) continue;
    const found = toks.filter((t) => inLower.includes(t.toLowerCase())).length;
    if (found / toks.length < 0.6) missing.push(`${r.context} (${r.raw})`.trim());
  }
  return missing.slice(0, 8);
}

function inferStage(p: CandidateProfile, years: number | null, text: string): string {
  if (p.career_stage) return p.career_stage;
  if (/\b(expected|anticipated)\s+(graduation\s+)?(19|20)\d{2}\b|\bcurrently (pursuing|enrolled)\b/i.test(text)) return "student";
  if (years === null || years < 1) return "new_grad";
  if (years < 3) return "early_career";
  if (years < 7) return "mid_career";
  return "senior";
}

export function validateIntake(p: Partial<CandidateProfile>): IntakeResult {
  const missing: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions: string[] = [];

  const req: [keyof CandidateProfile, string][] = [
    ["full_name", "Full name"],
    ["email", "Email"],
    ["phone", "Phone number"],
    ["location", "Location (City, Country or Remote)"],
    ["linkedin_url", "LinkedIn profile URL"],
    ["current_resume_text", "Current resume (paste the full text)"],
  ];
  for (const [k, label] of req) if (!String(p[k] ?? "").trim()) missing.push(label);

  if (p.email && !EMAIL_RE.test(p.email.trim())) errors.push(`Email "${p.email}" does not look valid.`);
  if (p.phone && (p.phone.match(/\d/g) ?? []).length < 7) errors.push(`Phone "${p.phone}" has too few digits.`);

  const normalizedLinkedIn = p.linkedin_url ? normalizeLinkedIn(p.linkedin_url) : null;
  if (p.linkedin_url && !normalizedLinkedIn) {
    errors.push(`LinkedIn URL "${p.linkedin_url}" is not a public profile URL. Expected: https://www.linkedin.com/in/<your-handle>`);
  }
  if (p.github_url && !/github\.com\/[A-Za-z0-9_-]+/i.test(p.github_url)) {
    warnings.push(`GitHub URL "${p.github_url}" doesn't look like https://github.com/<username>.`);
  }

  const resume = p.current_resume_text ?? "";
  if (resume && resume.trim().split(/\s+/).length < 60) {
    errors.push("The resume text is very short (<60 words). Ask the candidate to paste the full resume, not a summary.");
  }

  const li = p.linkedin_profile_text?.trim() ?? "";
  if (!li) {
    warnings.push(
      "LinkedIn profile content not provided. Recruiters open LinkedIn right after the resume, so the two must agree. " +
        "Ask the candidate to paste their profile (About, Experience, Skills), or export it with LinkedIn → Me → View Profile → More (···) → Save to PDF. " +
        "If you have web browsing, you may open the URL, but LinkedIn often blocks automated access. Never guess the profile's contents.",
    );
    questions.push("Please paste your LinkedIn profile text (About, Experience, Skills, Education) or the 'Save to PDF' export so I can keep the resume and profile consistent.");
  }

  const resumeSkills = findSkills(resume);
  const liSkills = li ? findSkills(li) : new Map();
  const skillsOnLiOnly = [...liSkills.keys()].filter((s) => !resumeSkills.has(s));

  const resumeMissingOnLi = li ? crossMissing(resume, li) : [];
  const liMissingOnResume = li ? crossMissing(li, resume) : [];
  if (resumeMissingOnLi.length) {
    warnings.push(`${resumeMissingOnLi.length} role(s) on the resume don't clearly appear on LinkedIn. Titles, companies and dates should match — update LinkedIn or confirm with the candidate.`);
  }

  let nameMatches: boolean | null = null;
  if (p.full_name && li) {
    const last = p.full_name.trim().split(/\s+/).pop()!.toLowerCase();
    nameMatches = li.toLowerCase().includes(last);
    if (!nameMatches) warnings.push("The candidate's surname doesn't appear in the LinkedIn text — confirm this is the right profile.");
  }

  const contact = extractContactSignals(resume);
  if (contact.linkedin && normalizedLinkedIn && normalizeLinkedIn(contact.linkedin) !== normalizedLinkedIn) {
    warnings.push(`The resume lists a different LinkedIn URL (${contact.linkedin}) than the one provided. The new resume will use ${normalizedLinkedIn}.`);
  }
  if (p.email && contact.email && contact.email.toLowerCase() !== p.email.trim().toLowerCase()) {
    warnings.push(`The resume lists a different email (${contact.email}); the new resume will use ${p.email}.`);
  }

  const years = p.years_of_experience ?? estimateYearsOfExperience(resume);
  const stage = inferStage(p as CandidateProfile, years, resume);
  const sections = splitResumeSections(resume);

  if (!p.target_role) questions.push("Which role title are you applying for (exactly as the posting says)?");
  if (!p.github_url && ["student", "new_grad", "early_career", "career_switcher"].includes(stage)) {
    questions.push("Do you have a GitHub profile? For early-career and career-switch candidates it is often the strongest proof of skill.");
  }
  if (!p.additional_context) {
    questions.push(
      "Anything that isn't on your resume yet: side projects, hackathons, open-source, courses/certifications, freelance work, or tools you've used at work but never listed?",
    );
  }
  if (!p.work_authorization) questions.push("Work authorization for the job's country (optional, but some ATS forms knock out on it)?");

  const ready = missing.length === 0 && errors.length === 0;
  return {
    ready,
    missing_required: missing,
    errors,
    warnings,
    linkedin: {
      url_valid: !!normalizedLinkedIn,
      normalized_url: normalizedLinkedIn,
      profile_text_provided: !!li,
      skills_on_linkedin_not_resume: skillsOnLiOnly,
      resume_roles_missing_on_linkedin: resumeMissingOnLi,
      linkedin_roles_missing_on_resume: liMissingOnResume,
      name_matches: nameMatches,
    },
    snapshot: {
      estimated_years_experience: years,
      inferred_career_stage: stage,
      detected_skills: [...resumeSkills.keys()],
      sections_found: Object.entries(sections).filter(([k, v]) => k !== "header" && v).map(([k]) => k),
      resume_word_count: resume.trim() ? resume.trim().split(/\s+/).length : 0,
    },
    questions_to_ask: questions,
    next_step: ready
      ? li
        ? "Intake complete. Confirm the details back to the candidate in one short summary, then call analyze_job_description with the JD."
        : "Required fields are present, but ask for the LinkedIn profile text first (see questions_to_ask). Continue only if the candidate says they can't provide it."
      : "Do NOT generate a resume yet. Ask the candidate for the missing/invalid items listed above, then call validate_intake again.",
  };
}
