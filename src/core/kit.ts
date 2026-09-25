/**
 * The Application Kit: everything a candidate needs to actually apply, generated
 * from the JD + their materials. Drafts are filled with the candidate's real data;
 * the driving AI is expected to polish tone, never to add new claims.
 */
import { HARD_CATEGORIES } from "../data/skills.js";
import { bulletText, type Resume } from "../schemas.js";
import { pickTheme } from "./bridge.js";
import { analyzeGaps, type GapAnalysis } from "./gap.js";
import { normalizeLinkedIn } from "./intake.js";
import { analyzeJobDescription, type JDAnalysis } from "./jd.js";
import { estimateYearsOfExperience, splitResumeSections } from "./resumeParse.js";
import { allBullets, resumeToText } from "./resumeText.js";
import { professionalRoles, yearsWithSkill } from "./roles.js";
import { findSkills } from "./skills.js";
import { toLines, unique } from "./text.js";

export interface KitCandidate {
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin_url: string;
  github_url?: string;
  portfolio_url?: string;
  resume_text: string;
  linkedin_text?: string;
  additional_context?: string;
  work_authorization?: string;
  needs_sponsorship?: boolean;
  willing_to_relocate?: boolean;
  notice_period?: string;
  salary_expectation?: string;
  referral_contact?: string;
}

export interface KitInput {
  jd_text: string;
  job_title?: string;
  company?: string;
  job_url?: string;
  /** "3 days ago", "today", or a date like 2026-09-20. */
  posted?: string;
  candidate: KitCandidate;
  /** The final tailored resume, if already drafted. Improves every draft. */
  resume?: Resume;
  now?: Date;
}

export interface FormAnswer {
  question: string;
  answer: string;
  note?: string;
}

export interface KnockoutCheck {
  check: string;
  jd_says: string;
  you: string;
  status: "ok" | "risk" | "unknown";
  advice: string;
}

export interface ApplicationKit {
  job: { title: string; company: string; url: string | null; ats: string; posted_days_ago: number | null };
  apply_today_checklist: string[];
  ats_tips: string[];
  knockout_check: KnockoutCheck[];
  form_answers: FormAnswer[];
  cover_letter: string;
  outreach: {
    find_people: { purpose: string; url: string }[];
    referral_request: string;
    linkedin_connection_note: string;
    recruiter_email: { subject: string; body: string };
    follow_up_email: { send_on: string; subject: string; body: string };
    thank_you_email: { subject: string; body: string };
  };
  linkedin_optimization: {
    headline: string;
    about: string;
    skills_to_add: string[];
    open_to_work_titles: string[];
    featured: string[];
  };
  interview_prep: {
    elevator_pitch: string;
    likely_questions: { question: string; why_they_ask: string; prep_hint: string }[];
    bullet_defense: { bullet: string; be_ready_for: string[] }[];
    questions_to_ask_them: string[];
  };
  tracker_entry: { company: string; role: string; job_url: string; status: string; applied_on: string; follow_up_on: string; second_follow_up_on: string };
  polish_instructions: string;
}

const ATS_TIPS: [RegExp, string, string[]][] = [
  [/myworkdayjobs|workday/i, "Workday", [
    "Upload the DOCX. Workday re-parses it into form fields: check every auto-filled title, date and school, and fix anything mangled.",
    "Each company's Workday is a separate account. Use the same email as your resume and save the password.",
    "The 'How did you hear about us' and self-identification pages are required; answers below.",
  ]],
  [/greenhouse\.io|boards\.greenhouse/i, "Greenhouse", [
    "The PDF is fine. If there's a cover letter field, paste the cover letter below rather than attaching a file.",
    "Recruiters read the custom questions. Use the drafted answers and keep each to 2–4 sentences.",
  ]],
  [/lever\.co/i, "Lever", [
    "The PDF is fine. Use the 'Additional information' box for the short note drafted below. Lever shows it next to your resume.",
    "Fill in the LinkedIn and GitHub URL fields; reviewers click them.",
  ]],
  [/ashbyhq\.com/i, "Ashby", ["The PDF is fine. The forms are short, so answer every optional question; it signals effort."]],
  [/icims\.com/i, "iCIMS", ["Upload the DOCX and check the parsed work history fields before submitting."]],
  [/taleo\.net/i, "Taleo", ["Upload the DOCX. Taleo forms are long; save progress often and keep formatting plain when pasting."]],
  [/smartrecruiters\.com/i, "SmartRecruiters", ["The PDF is fine. Use the 'Message to the hiring team' box for the short note below."]],
  [/linkedin\.com\/jobs/i, "LinkedIn Easy Apply", [
    "Attach the tailored resume (not your default one) and answer screening questions from the answers below.",
    "If the company also has a careers-site posting, apply there too. Easy Apply piles are huge.",
  ]],
];

function parsePosted(posted: string | undefined, now: Date): number | null {
  if (!posted) return null;
  const p = posted.trim().toLowerCase();
  if (/today|just now|hours? ago/.test(p)) return 0;
  if (/yesterday/.test(p)) return 1;
  const m = p.match(/(\d+)\+?\s*(day|week|month)s?\s*ago/);
  if (m) return Number(m[1]) * (m[2] === "week" ? 7 : m[2] === "month" ? 30 : 1);
  const d = new Date(posted);
  return isNaN(d.getTime()) ? null : Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const stripDot = (s: string) => s.trim().replace(/[.;]\s*$/, "");
const listJoin = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const shortTitle = (t: string) => t.split(/\s*[,(|–-]\s*/)[0].trim();

/** Present-tense "X builds Y" → "building Y" for "Why us?" answers. */
function aboutToGerund(about: string, company: string): string | null {
  const m = about.match(new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([a-z]+)s\\s+(.+)$`, "i"));
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const ing = verb.endsWith("e") && !verb.endsWith("ee") ? `${verb.slice(0, -1)}ing` : `${verb}ing`;
  return `${ing} ${stripDot(m[2])}`;
}

interface Evidence {
  text: string;
  company: string | null;
}

/** Professional (not project) bullets, best first: quantified, JD-relevant, recent. */
function evidenceLines(input: KitInput, jd: JDAnalysis): Evidence[] {
  const weights = new Map(jd.keywords.map((k) => [k.skill, k.weight]));
  const raw: (Evidence & { roleIndex: number })[] = input.resume
    ? input.resume.experience.flatMap((e, i) => e.bullets.map((b) => ({ text: bulletText(b), company: e.company, roleIndex: i })))
    : professionalRoles(input.candidate.resume_text).flatMap((r, i) =>
        r.text.split("\n").slice(1).map((l) => l.replace(/^\s*([-*•●▪]|\d+\.)\s+/, "").trim())
          .filter((l) => l.split(/\s+/).length >= 6)
          .map((l) => ({ text: l, company: r.company || null, roleIndex: i })),
      );
  return raw
    .map((x) => ({
      x,
      s:
        Math.min(8, [...findSkills(x.text).keys()].reduce((a, k) => a + (weights.get(k) ?? 0), 0)) +
        // Real metrics only: ignore digits inside names like "EC2" or "S3".
        (/\d/.test(x.text.replace(/\b[A-Za-z]+\d+[A-Za-z]*\b/g, "")) ? 6 : 0) +
        (/\d\s?%|\d+x\b|\bfrom\b.+\bto\b.+\d/i.test(x.text) ? 3 : 0) +
        (x.roleIndex === 0 ? 3 : 0) -
        (/^(responsible|worked|helped|participated)/i.test(x.text) ? 5 : 0),
    }))
    .sort((a, b) => b.s - a.s)
    .map(({ x }) => ({ text: stripDot(x.text), company: x.company }));
}

function defenseQuestions(bullet: string): string[] {
  const q: string[] = [];
  const metrics = unique(
    [...bullet.matchAll(/(?:\$\s?)?\b\d[\d,.]*\s?(?:%|x\b|ms\b|µs\b|seconds?\b|minutes?\b|hours?\b|days?\b|k\b|m\b|requests per second|orders per day|users\b|engineers\b)?/gi)]
      .map((m) => m[0].trim())
      .filter((m) => /\D/.test(m) || m.replace(/,/g, "").length >= 3),
  ).slice(0, 3);
  if (metrics.length) q.push(`How did you measure ${metrics.map((m) => `"${m}"`).join(", ")}? What was the baseline, and what was your part versus the team's?`);
  if (/^(led|owned|spearheaded|drove|headed|managed|mentored|coordinated)/i.test(bullet)) q.push("What exactly was your role versus the team's? How many people, and what was the hardest decision you made?");
  if (/^(re-?architected|migrated|refactored|modernized|redesigned)/i.test(bullet)) q.push("Why was the change needed, what were the risks, and how did you roll it out safely (flags, canaries, rollback)?");
  const skill = [...findSkills(bullet).values()].find((h) => HARD_CATEGORIES.has(h.skill.category) && h.skill.category !== "architecture")?.skill.name;
  if (skill) q.push(`Why ${skill}? What alternatives did you consider, and what would you change today?`);
  if (/^building|^exposing|in progress/i.test(bullet)) q.push("Be ready to demo it or share the repo, and to explain what's left and why you built it.");
  if (!q.length) q.push("What problem did this solve, how did you know it worked, and what would you do differently?");
  return q.slice(0, 3);
}

const SYSTEM_DESIGN: Record<string, string> = {
  backend: "Design a {domain} {entity} service: APIs, data model, idempotency, consistency, retries, and how it scales 10x.",
  fullstack: "Design a {domain} app end-to-end: API, data model, real-time updates in the UI, and how you'd scale it.",
  software_engineering: "Design a {domain} {entity} service: APIs, data model, failure handling, and how it scales 10x.",
  devops_platform: "How would you run a {domain} service with zero-downtime deploys, SLOs, alerting and fast rollback?",
  frontend: "Design a real-time {domain} dashboard: state management, data fetching, performance and accessibility.",
  mobile: "Design an offline-first {domain} mobile app: local storage, sync conflicts, push notifications.",
  data_engineering: "Design a pipeline that ingests {domain} {event} data daily: schema, orchestration, data quality, backfills.",
  data_science_analytics: "How would you measure whether a new {domain} feature worked? Metrics, experiment design, pitfalls.",
  ai_ml_engineering: "Design an LLM-powered {domain} assistant: retrieval, evaluation, latency/cost, and guardrails.",
  security: "Threat-model a {domain} {entity} service. What are the top risks and your controls?",
  qa_testing: "How would you design the test strategy for a {domain} product release? What do you automate first?",
};

const BEHAVIORAL: [RegExp, string][] = [
  [/ownership of systems/i, "Tell me about a system you owned end-to-end. What key technical decision did you make, and who did you mentor along the way?"],
  [/cross-team influence/i, "Tell me about a technical decision you drove across multiple teams."],
  [/team size, hiring/i, "How do you hire, grow and retain engineers? Give a specific example."],
  [/projects, coursework/i, "Walk me through the project you're proudest of. What would you build differently now?"],
  [/quantify scale/i, "What's the largest scale you've operated at? Walk me through the numbers and the bottleneck you hit."],
  [/on-call/i, "Walk me through a production incident you handled. How did you find the root cause, and what changed afterwards?"],
  [/0→1|minimal direction/i, "Tell me about something you shipped with very little direction."],
  [/customer\/user outcomes/i, "Tell me about work you tied directly to a customer or user outcome."],
  [/LLM feature/i, "How did you evaluate an LLM feature's quality, latency and cost?"],
  [/security, compliance/i, "How have you handled sensitive data or compliance requirements in your work?"],
  [/remote-friendly|async/i, "How do you stay unblocked and keep others informed on a remote team?"],
];

function behavioralQuestions(expectations: string[]): string[] {
  return unique(expectations.map((e) => BEHAVIORAL.find(([re]) => re.test(e))?.[1]).filter((q): q is string => !!q)).slice(0, 3);
}

export function buildApplicationKit(input: KitInput): ApplicationKit {
  const now = input.now ?? new Date();
  const c = input.candidate;
  const jd = analyzeJobDescription(input.jd_text, { title: input.job_title, company: input.company });
  const gaps: GapAnalysis = analyzeGaps(
    jd,
    { resume_text: c.resume_text, linkedin_text: c.linkedin_text, additional_context: c.additional_context },
    input.jd_text,
  );
  const company = jd.company ?? input.company ?? "the company";
  const title = jd.title ?? input.job_title ?? "this role";
  const role = shortTitle(title);
  const url = input.job_url ?? null;
  const ats = url ? (ATS_TIPS.find(([re]) => re.test(url))?.[1] ?? "Company careers site") : "Unknown (paste the job URL to get portal-specific tips)";
  const atsTips = url ? (ATS_TIPS.find(([re]) => re.test(url))?.[2] ?? ["Upload the DOCX unless the site says PDF, and double-check any auto-filled fields."]) : [];
  const postedDays = parsePosted(input.posted, now);
  const theme = pickTheme(input.jd_text);
  const linkedin = normalizeLinkedIn(c.linkedin_url) ?? c.linkedin_url;
  const years = estimateYearsOfExperience(c.resume_text);
  const yearsTxt = years !== null ? `${Math.floor(years)}` : "";
  const roles = professionalRoles(c.resume_text);
  const currentRole = roles[0];

  // Only skills used in real, dated roles count as experience. Never bridge projects or "learning".
  const professionalText = [
    ...roles.map((r) => r.text),
    ...(input.resume ? input.resume.experience.flatMap((e) => [e.title, ...e.bullets.map(bulletText)]) : []),
  ].join("\n");
  const resumeSkills = findSkills(professionalText);
  const listedSkills = findSkills([c.resume_text, input.resume ? input.resume.skills.flatMap((s) => s.items).join(", ") : ""].join("\n"));
  const matchedMust = jd.keywords
    .filter((k) => k.importance === "must_have" && HARD_CATEGORIES.has(k.category) && k.category !== "architecture" && resumeSkills.has(k.skill))
    .map((k) => k.skill);
  const top3 = matchedMust.slice(0, 3);
  const evidence = evidenceLines(input, jd);
  const e1 = evidence[0]?.text;
  const e2 = evidence[1]?.text;
  const bridge = input.resume?.projects.find((p) => p.status === "in_progress") ?? null;
  const bridgeName = bridge?.name ?? gaps.bridge_projects[0]?.name ?? null;
  const notEvidenced = gaps.gaps
    .filter((g) => g.importance === "must_have" && !resumeSkills.has(g.skill) && (g.strategy !== "surface" || g.learning))
    .filter((g) => jd.keywords.some((k) => k.skill === g.skill && HARD_CATEGORIES.has(k.category)))
    .map((g) => g.skill);
  const gapSkills = notEvidenced.filter((s) => jd.keywords.find((k) => k.skill === s)?.category !== "architecture").slice(0, 3);
  const about = jd.about.find((a) => a.toLowerCase().startsWith(company.toLowerCase())) ?? jd.about[0];
  const gerund = about ? aboutToGerund(about, company) : null;
  const domain = "match" in theme ? theme.domain : (jd.domain_terms[0] ?? theme.domain);

  // ── Why us / fit ────────────────────────────────────────────────────────
  const whyCompany =
    `${gerund ? `${company} is ${gerund}` : `${company}'s work in ${domain} stands out to me`}, and that's the kind of work I want to be doing. ` +
    (e1 ? `It's close to what I do today: I ${lowerFirst(e1)}. ` : "") +
    `[Personalize: add one specific thing you admire about ${company}, such as a product, an engineering blog post, or a value.]`;
  const whyFit =
    `The role centers on ${listJoin(top3.length ? top3 : jd.must_have.slice(0, 3))}, which is where most of my ${yearsTxt ? `${yearsTxt} years of ` : ""}experience is. ` +
    (e1 ? `For example, I ${lowerFirst(e1)}.` : "") +
    (e2 ? ` I also ${lowerFirst(e2)}.` : "") +
    (bridgeName && gapSkills.length ? ` To close the gap on ${listJoin(gapSkills)}, I'm building ${bridgeName}.` : "");
  const projectAnswer = e1
    ? `I ${lowerFirst(e1)}. [Add in 2–3 sentences: the problem, what you specifically did, and how you knew it worked.]`
    : "[Pick your strongest bullet and expand it: problem → what you did → measurable result.]";

  // ── Knockout checks ─────────────────────────────────────────────────────
  const knockout: KnockoutCheck[] = [];
  if (jd.years_required) {
    const ok = years !== null && years >= jd.years_required;
    const close = years !== null && years >= jd.years_required - 1;
    knockout.push({
      check: "Years of experience",
      jd_says: `${jd.years_required}+ years`,
      you: years !== null ? `~${years} years` : "unknown",
      status: ok ? "ok" : years === null ? "unknown" : "risk",
      advice: ok
        ? "Meets the bar. State your real total."
        : close
          ? "Within about a year. Apply anyway; lead with scope and impact. Forms: enter your real number."
          : "Well below the bar. Apply only with a referral, or target a level down.",
    });
  }
  if (jd.education.length) {
    const hasDegree = /\b(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s\.?c?|master|m\.?\s?s\.?c?|m\.?\s?tech|mba|ph\.?d)/i.test(splitResumeSections(c.resume_text).education || c.resume_text);
    const equivalent = /equivalent|or related experience|or experience/i.test(jd.education.join(" "));
    knockout.push({
      check: "Education",
      jd_says: jd.education[0],
      you: hasDegree ? "Degree listed on resume" : "No degree found on resume",
      status: hasDegree ? "ok" : equivalent ? "risk" : "unknown",
      advice: hasDegree ? "Mirror the degree wording exactly." : equivalent ? "'Or equivalent experience' is accepted. Emphasize years, projects and certifications." : "Confirm your education; if you have none, lean on a referral.",
    });
  }
  if (jd.eligibility_notes.length) {
    const needs = c.needs_sponsorship;
    const noSponsor = /\b(not|unable to|cannot|no)\b[^.]{0,30}\bsponsor/i.test(jd.eligibility_notes.join(" "));
    knockout.push({
      check: "Work authorization / sponsorship",
      jd_says: jd.eligibility_notes[0].slice(0, 200),
      you: c.work_authorization ?? (needs === undefined ? "not provided" : needs ? "needs sponsorship" : "no sponsorship needed"),
      status: needs === undefined && !c.work_authorization ? "unknown" : needs && noSponsor ? "risk" : "ok",
      advice: needs && noSponsor ? "The posting says it won't sponsor. Answer truthfully. It's usually a hard filter, so prioritize other roles unless you have a referral." : "Answer truthfully and consistently everywhere. Mismatches get flagged.",
    });
  }
  if (jd.work_mode) {
    knockout.push({
      check: "Work mode / location",
      jd_says: jd.work_mode,
      you: `${c.location ?? "location not provided"}${c.willing_to_relocate ? " (willing to relocate)" : ""}`,
      status: jd.work_mode === "remote" || c.willing_to_relocate ? "ok" : "unknown",
      advice: jd.work_mode === "remote" ? "Check whether 'remote' is limited to certain countries or time zones." : "If you're not local, say you're open to relocating (only if true) in the form and the cover note.",
    });
  }
  const missingMust = notEvidenced;
  knockout.push({
    check: "Must-have skills",
    jd_says: `${jd.must_have.length} must-haves`,
    you: `${gaps.must_have_coverage} on the original resume`,
    status: missingMust.length === 0 ? "ok" : missingMust.length <= 2 ? "risk" : "risk",
    advice: missingMust.length ? `Not yet evidenced: ${missingMust.slice(0, 5).join(", ")}. Confirm any real use, and start a bridge project or certification for the rest.` : "All must-haves are covered.",
  });

  // ── Form answers ────────────────────────────────────────────────────────
  const hardMust = jd.keywords
    .filter((k) => k.importance === "must_have" && HARD_CATEGORIES.has(k.category) && k.category !== "architecture")
    .map((k) => k.skill)
    .slice(0, 8);
  const skillYears = yearsWithSkill(input.resume ? resumeToText({ ...input.resume, projects: [] }) : c.resume_text, hardMust, now);
  const form: FormAnswer[] = [
    { question: "Full name", answer: c.full_name },
    { question: "Email", answer: c.email },
    ...(c.phone ? [{ question: "Phone", answer: c.phone }] : []),
    ...(c.location ? [{ question: "Current location", answer: c.location }] : []),
    { question: "LinkedIn profile", answer: linkedin },
    ...(c.github_url ? [{ question: "GitHub", answer: c.github_url }] : []),
    ...(c.portfolio_url ? [{ question: "Portfolio / website", answer: c.portfolio_url }] : []),
    {
      question: "Total years of professional experience",
      answer: years !== null ? String(Math.floor(years * 2) / 2) : "[your total]",
      note: "Rounded down. If a dropdown forces a range, pick the one that contains this number.",
    },
    ...skillYears.map((y) => ({
      question: `Years of experience with ${y.skill}`,
      answer: y.years >= 1 ? String(y.years) : y.label,
      note: y.basis.length ? `Based on: ${y.basis.join("; ")}` : "Not tied to a dated role on your resume. If you used it at work, say where, then add it to that role's bullets.",
    })),
    { question: "Are you legally authorized to work in this country?", answer: c.work_authorization ?? "[Yes / No: answer truthfully]" },
    { question: "Will you now or in the future require visa sponsorship?", answer: c.needs_sponsorship === undefined ? "[Yes / No: answer truthfully]" : c.needs_sponsorship ? "Yes" : "No" },
    { question: "Are you willing to relocate?", answer: c.willing_to_relocate === undefined ? "[Yes / No]" : c.willing_to_relocate ? "Yes" : "No" },
    { question: "Earliest start date / notice period", answer: c.notice_period ?? "[e.g. 2 weeks / 30 days from offer]" },
    {
      question: "Desired salary",
      answer: c.salary_expectation ?? `[Research the range for ${role} in your location on levels.fyi, Glassdoor or the posting's pay range, then answer:] "I'm targeting [range] based on the market for this role, and I'm flexible on the overall package."`,
      note: "If a number is required and the posting lists a range, pick a value inside it. Avoid anchoring below it.",
    },
    { question: `Why do you want to work at ${company}?`, answer: whyCompany },
    { question: "Why are you a good fit for this role?", answer: whyFit },
    { question: "Describe a project or accomplishment you're proud of", answer: projectAnswer },
    { question: "How did you hear about this position?", answer: c.referral_contact ? `Referral from ${c.referral_contact}` : url?.includes("linkedin") ? "LinkedIn" : "Company careers page" },
    {
      question: "Additional information / message to the hiring team",
      answer: `I'm excited about the ${role} role. My background in ${listJoin(top3.length ? top3 : jd.must_have.slice(0, 3))} maps closely to what you're looking for${e1 ? `. Most recently I ${lowerFirst(e1)}` : ""}. I'd welcome the chance to talk.`,
    },
  ];

  // ── Cover letter ────────────────────────────────────────────────────────
  const contactLine = [c.email, c.phone, linkedin.replace(/^https?:\/\/(www\.)?/, "")].filter(Boolean).join(" · ");
  const cover = [
    `Dear ${company} Hiring Team,`,
    "",
    `I'm applying for the ${title} role. ${gerund ? `${company} is ${gerund}, ` : `Your work in ${domain} is `}the kind of problem I want to work on. With ${yearsTxt ? `${yearsTxt} years of ` : ""}experience in ${listJoin(top3.length ? top3 : jd.must_have.slice(0, 3))}, I've spent my career on the problems this role centers on.`,
    "",
    [
      evidence[0]?.company ? `At ${evidence[0].company}, I ${lowerFirst(e1!)}.` : e1 ? `Recently, I ${lowerFirst(e1)}.` : "",
      e2 ? ` I also ${lowerFirst(e2)}.` : "",
      (() => {
        // Only name focus-point skills the candidate has actually used.
        const fp = jd.focus_points.find((f) => f.skills.some((s) => resumeSkills.has(s)));
        const s = fp ? fp.skills.filter((x) => resumeSkills.has(x)).slice(0, 3) : [];
        return s.length ? ` That experience maps directly to your need for ${listJoin(s)} expertise.` : "";
      })(),
    ].join(""),
    ...(bridgeName && gapSkills.length ? ["", `To go deeper on ${listJoin(gapSkills)}, I'm currently building ${bridgeName}. I'd be glad to walk you through it.`] : []),
    "",
    `I'd welcome the chance to discuss how I can contribute to ${company}. Thank you for your time and consideration.`,
    "",
    "Sincerely,",
    c.full_name,
    contactLine,
  ].join("\n");

  // ── Outreach ────────────────────────────────────────────────────────────
  const li = (q: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
  const school = (splitResumeSections(c.resume_text).education.match(/\b([A-Z][A-Za-z.&'-]*(?:\s+[A-Z][A-Za-z.&'-]*)*\s+(?:University|College|Institute(?: of [A-Z][a-z]+)*))\b|\b((?:University|Institute) of [A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/) ?? [])
    .slice(1)
    .find(Boolean);
  const findPeople = [
    { purpose: `People doing this job at ${company} (ask for a referral)`, url: li(`${company} ${role}`) },
    { purpose: `Recruiters at ${company}`, url: li(`${company} technical recruiter`) },
    { purpose: `Engineering managers at ${company}`, url: li(`${company} engineering manager`) },
    ...(school ? [{ purpose: `${school} alumni at ${company} (warmest intros)`, url: li(`${company} ${school}`) }] : []),
  ];
  const skills2 = listJoin((top3.length ? top3 : jd.must_have).slice(0, 2));
  const referral = [
    `Hi [Name],`,
    "",
    `I'm applying for the ${title} role at ${company}${url ? ` (${url})` : ""}. I'm a ${currentRole?.title ?? "software engineer"}${yearsTxt ? ` with ${yearsTxt} years of experience` : ""}, mostly in ${skills2}${e1 ? `. Recently I ${lowerFirst(e1).slice(0, 160)}` : ""}.`,
    "",
    `Would you be open to referring me, or telling me what the team values most? I've attached my resume and I'm happy to keep it quick. Thank you!`,
    "",
    c.full_name,
  ].join("\n");
  let note = `Hi [Name], I'm applying for ${role} at ${company}. My background is in ${skills2}. I'd love to connect and hear about the team!`;
  if (note.length > 200) note = `Hi [Name], I'm applying for ${role} at ${company} and would love to connect and learn about the team!`;
  if (note.length > 200) note = note.slice(0, 197) + "...";
  const subject = `${role} application: ${c.full_name}${top3.length ? ` (${top3.slice(0, 2).join(", ")}${yearsTxt ? `, ${yearsTxt} yrs` : ""})` : ""}`;
  const recruiterBody = [
    `Hi [Name],`,
    "",
    `I just applied for the ${title} role${url ? ` (${url})` : ""} and wanted to reach out directly. ${whyFit}`,
    "",
    `My resume is attached. Would you have 15 minutes to talk this week or next?`,
    "",
    `Best,`,
    c.full_name,
    contactLine,
  ].join("\n");
  const followUp = {
    send_on: iso(addDays(now, 7)),
    subject: `Following up: ${role} application`,
    body: [`Hi [Name],`, "", `I applied for the ${title} role on ${iso(now)} and wanted to follow up. I'm still very interested, especially in ${domain}${e1 ? `, where my recent work (I ${lowerFirst(e1).slice(0, 120)}) is directly relevant` : ""}.`, "", `Is there anything else I can share to help with the review?`, "", `Thanks,`, c.full_name].join("\n"),
  };
  const thankYou = {
    subject: `Thank you: ${role} interview`,
    body: [`Hi [Interviewer],`, "", `Thank you for taking the time to talk today about the ${role} role. I especially enjoyed discussing [specific topic from the interview].`, "", `It reinforced my interest in ${company}. [One sentence tying your experience to something they said.]`, "", `Looking forward to next steps,`, c.full_name].join("\n"),
  };

  // ── LinkedIn ────────────────────────────────────────────────────────────
  const liSkills = c.linkedin_text ? findSkills(c.linkedin_text) : null;
  const skillsToAdd = unique([...matchedMust, ...[...resumeSkills.keys()].filter((s) => HARD_CATEGORIES.has(resumeSkills.get(s)!.skill.category))])
    .filter((s) => !liSkills || !liSkills.has(s))
    .slice(0, 15);
  const baseTitle = role.replace(/^(senior|sr\.?|junior|jr\.?|staff|principal|lead)\s+/i, "");
  // Keep a seniority word only if the candidate's level supports it.
  const seniorOk = /\b(senior|sr|staff|principal|lead)\b/i.test(currentRole?.title ?? "") || (years !== null && jd.years_required !== null && years >= jd.years_required);
  const headlineTitle = seniorOk ? role : baseTitle;
  const headline = `${headlineTitle} | ${(top3.length ? top3 : [...listedSkills.keys()].slice(0, 3)).join(" · ")} | ${domain.replace(/^\w/, (x) => x.toUpperCase())}`.slice(0, 220);
  const aboutText = [
    input.resume?.summary ?? `${role} with ${yearsTxt ? `${yearsTxt} years of ` : ""}experience in ${listJoin(top3.length ? top3 : jd.must_have.slice(0, 3))}.`,
    "",
    ...(evidence.length ? ["Highlights:", ...evidence.slice(0, 3).map((e) => `• ${e}`), ""] : []),
    bridgeName ? `Currently building: ${bridgeName}.` : "",
    `Open to ${role} roles. Reach me at ${c.email}.`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  const openTitles = unique([role, baseTitle, /engineer/i.test(role) ? "Software Engineer" : baseTitle].filter(Boolean)).slice(0, 5);

  // ── Interview prep ──────────────────────────────────────────────────────
  const fill = (s: string) => s.replace(/\{domain\}/g, theme.domain).replace(/\{entity\}/g, theme.entity).replace(/\{event\}/g, theme.event);
  const design = SYSTEM_DESIGN[jd.role_family];
  const questions: ApplicationKit["interview_prep"]["likely_questions"] = [
    { question: "Tell me about yourself.", why_they_ask: "Every interview opens with it.", prep_hint: "Use the elevator pitch below. Keep it under 90 seconds." },
    ...matchedMust.slice(0, 4).map((s) => ({
      question: `How have you used ${s} in production? What trade-offs did you make?`,
      why_they_ask: `${s} is a must-have in the JD.`,
      prep_hint: "Pick one concrete example, with a problem, your decision, the alternatives, and the result.",
    })),
    ...(design ? [{ question: fill(design), why_they_ask: `Standard system-design round for ${jd.role_family.replace(/_/g, " ")} roles, themed to their domain.`, prep_hint: "Clarify requirements, sketch components, go deep on one hard part, and discuss failure modes." }] : []),
    ...gapSkills.slice(0, 2).map((s) => ({
      question: `You haven't used ${s} in production. How would you ramp up?`,
      why_they_ask: "They'll notice gaps against the JD.",
      prep_hint: bridgeName ? `Point to ${bridgeName}: what you built, what surprised you, and what you'd do next.` : `Show a concrete plan: docs, a small project, and who you'd learn from.`,
    })),
    ...behavioralQuestions(jd.implied_expectations).map((question) => ({ question, why_they_ask: "Implied by the role's level and context.", prep_hint: "Use STAR: situation, task, action, result, with a number." })),
    { question: "Tell me about a time you disagreed with a teammate or made a mistake.", why_they_ask: "Tests collaboration and ownership.", prep_hint: "Pick a real one that has a lesson learned and a changed behavior." },
  ];
  const bulletsForDefense = input.resume
    ? allBullets(input.resume).map((b) => bulletText(b.bullet))
    : toLines(`${splitResumeSections(c.resume_text).experience}\n${splitResumeSections(c.resume_text).projects}`).filter((l) => l.split(/\s+/).length >= 6);
  const pitch = [
    `I'm a ${currentRole?.title ?? role}${currentRole?.company ? ` at ${currentRole.company}` : ""}${yearsTxt ? ` with ${yearsTxt} years of experience` : ""} in ${listJoin((top3.length ? top3 : jd.must_have).slice(0, 3))}.`,
    e1 ? `Most recently I ${lowerFirst(e1)}.` : "",
    bridgeName ? `Outside work I'm building ${bridgeName} to go deeper on ${listJoin(gapSkills.slice(0, 2)) || "the stack you use"}.` : "",
    `I'm excited about ${company} because [your real reason], and this role builds directly on what I do best.`,
  ].filter(Boolean).join(" ");

  const tracker = {
    company,
    role: title,
    job_url: url ?? "",
    status: "Ready to apply",
    applied_on: iso(now),
    follow_up_on: iso(addDays(now, 7)),
    second_follow_up_on: iso(addDays(now, 14)),
  };

  // ── Checklist ───────────────────────────────────────────────────────────
  const checklist = [
    postedDays === null
      ? "Apply today. Earlier applicants are usually reviewed first."
      : postedDays <= 3
        ? `Posted ${postedDays === 0 ? "today" : `${postedDays} day(s) ago`}: apply today, while the pile is small.`
        : postedDays <= 14
          ? `Posted ${postedDays} days ago: apply today and send referral requests the same day.`
          : `Posted ${postedDays} days ago (older posting). Still apply, but a referral or recruiter message matters most now.`,
    `Upload the tailored resume (${/Workday|iCIMS|Taleo/.test(ats) ? "DOCX" : "PDF, or DOCX if required"}). File name: ${c.full_name.replace(/\s+/g, "_")}_${company.replace(/\W+/g, "")}_${role.replace(/\W+/g, "_")}_Resume.`,
    "Copy the form answers below. Fill every [bracket] with your real answer before submitting.",
    "Paste the cover letter if there's a field, or attach Cover_Letter.docx if there's an upload.",
    "Send 2–3 referral requests using the 'find people' links (alumni and 2nd-degree connections first).",
    "Update LinkedIn with the headline and skills below, so the resume and profile tell the same story.",
    `Log the application in your tracker. Follow up on ${followUp.send_on} if you haven't heard back.`,
    ...(bridgeName ? [`Start or finish the bridge project "${bridgeName}" before any interview. Push it to GitHub.`] : []),
    "Before interviews: rehearse the elevator pitch and prepare answers for 'be ready for' on every bullet.",
  ];

  return {
    job: { title, company, url, ats, posted_days_ago: postedDays },
    apply_today_checklist: checklist,
    ats_tips: atsTips,
    knockout_check: knockout,
    form_answers: form,
    cover_letter: cover,
    outreach: {
      find_people: findPeople,
      referral_request: referral,
      linkedin_connection_note: note,
      recruiter_email: { subject, body: recruiterBody },
      follow_up_email: followUp,
      thank_you_email: thankYou,
    },
    linkedin_optimization: {
      headline,
      about: aboutText,
      skills_to_add: skillsToAdd,
      open_to_work_titles: openTitles,
      featured: [
        ...(bridgeName ? [`Pin the ${bridgeName} GitHub repo once it has a README and results.`] : []),
        ...(c.github_url ? [`Link your GitHub (${c.github_url}) in the Featured section.`] : []),
        "Turn on Open to Work → 'Recruiters only' so your current employer doesn't see it.",
      ],
    },
    interview_prep: {
      elevator_pitch: pitch,
      likely_questions: questions,
      bullet_defense: bulletsForDefense.slice(0, 12).map((b) => ({ bullet: stripDot(b), be_ready_for: defenseQuestions(b) })),
      questions_to_ask_them: [
        `What does success look like for this ${role} in the first 90 days?`,
        `What's the hardest technical problem the team is working on in ${domain} right now?`,
        "How does the team handle on-call, code review and technical decisions?",
        "What would make someone great in this role, as opposed to good?",
      ],
    },
    tracker_entry: tracker,
    polish_instructions:
      "Polish tone and flow of the drafts, but never add facts, numbers or skills that aren't in the candidate's materials. Fill every [bracket] with the candidate's real input. Keep the cover letter under 250 words and the referral request under 120.",
  };
}
