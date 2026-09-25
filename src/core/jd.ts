import { CATEGORY_LABELS, HARD_CATEGORIES, type SkillCategory } from "../data/skills.js";
import { ALL_ACTION_VERBS, IRREGULAR_PAST } from "../data/verbs.js";
import { findSkills, atsPhrasing, type SkillHit } from "./skills.js";
import { normalizeWhitespace, salientPhrases, unique } from "./text.js";

export type SectionKind = "title" | "required" | "preferred" | "responsibilities" | "about" | "benefits" | "unknown";
export type Importance = "must_have" | "nice_to_have" | "contextual";
export type Seniority = "intern" | "entry" | "mid" | "senior" | "staff_plus" | "manager" | "unknown";

export interface JDKeyword {
  skill: string;
  category: SkillCategory;
  importance: Importance;
  /** Relative weight used for scoring; higher = matters more to this JD. */
  weight: number;
  count: number;
  /** Exact phrasing(s) the JD used — mirror these literally on the resume. */
  jd_terms: string[];
  /** Recommended resume phrasing (includes acronym expansion where useful). */
  write_as: string;
  years?: number;
}

export interface FocusPoint {
  rank: number;
  statement: string;
  section: SectionKind;
  skills: string[];
  weight: number;
}

export interface JDAnalysis {
  title: string | null;
  company: string | null;
  seniority: Seniority;
  role_family: string;
  years_required: number | null;
  education: string[];
  certifications: string[];
  keywords: JDKeyword[];
  must_have: string[];
  nice_to_have: string[];
  focus_points: FocusPoint[];
  category_emphasis: { category: string; share: number }[];
  responsibilities: string[];
  action_verbs_to_mirror: string[];
  soft_skills: string[];
  domain_terms: string[];
  implied_expectations: string[];
  word_count: number;
}

const SECTION_PATTERNS: [SectionKind, RegExp][] = [
  ["benefits", /\b(benefits|perks|compensation|salary|pay range|what we offer|equal (employment )?opportunit|eeo|accommodation)\b/i],
  ["preferred", /\b(preferred|nice[- ]to[- ]have|bonus|pluses|a plus|desired|good[- ]to[- ]have|extra credit|ideally|stand out)\b/i],
  ["required", /\b(requirements?|qualifications?|must[- ]have|what you('| wi)ll need|what we('| a)re looking for|you have|you bring|who you are|about you|minimum|basic qualifications|skills|need to have|what you need)\b/i],
  ["responsibilities", /\b(responsibilit|what you('| wi)ll do|the role|your role|day[- ]to[- ]day|duties|in this role|what you('| wi)ll be doing|key tasks|your impact|you will|the job|the opportunity)\b/i],
  ["about", /\b(about (us|the company|the team|[A-Z][\w&.-]+)|who we are|our mission|our team|why join|our story|company overview)\b/i],
];

const SECTION_WEIGHT: Record<SectionKind, number> = {
  title: 5,
  required: 3,
  responsibilities: 2,
  unknown: 1.8,
  preferred: 1.2,
  about: 0.5,
  benefits: 0,
};

const REQUIRED_CUE = /\b(must|required|requires|minimum|proficien|strong|expert|deep|solid|extensive|hands[- ]on|proven|demonstrated)\b/i;
const PREFERRED_CUE = /\b(preferred|nice to have|a plus|bonus|ideally|familiarity|exposure to|desirable|good to have)\b/i;

function isHeader(line: string): boolean {
  const t = line.trim();
  if (t.length > 70) return false;
  // Short lines like "Nice to have" / "What you'll do" — the section phrase must lead the line.
  if (t.split(/\s+/).length <= 5 && !/[.!?,;]$/.test(t)) {
    for (const [, re] of SECTION_PATTERNS) {
      const m = t.match(re);
      if (m && (m.index ?? 99) <= 10) return true;
    }
  }
  if (/[:：]\s*$/.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  // Title Case or ALL CAPS short line with no sentence punctuation
  if (!/[.!?,;]/.test(t) && t.split(/\s+/).length <= 7) {
    const words = t.replace(/[^A-Za-z\s']/g, "").split(/\s+/).filter(Boolean);
    const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
    return words.length > 0 && capped / words.length >= 0.6;
  }
  return false;
}

function classifyHeader(line: string): SectionKind | null {
  for (const [kind, re] of SECTION_PATTERNS) if (re.test(line)) return kind;
  return null;
}

const TITLE_RE =
  /\b(engineer|developer|programmer|architect|scientist|analyst|manager|designer|lead|intern|specialist|consultant|administrator|associate|director|coordinator|officer|sre|devops|technician|representative|executive|accountant|nurse|teacher|recruiter|writer|researcher|strategist)\b/i;

function detectTitle(lines: string[], explicit?: string): string | null {
  if (explicit?.trim()) return explicit.trim();
  for (const l of lines.slice(0, 6)) {
    const t = l.replace(/^(job title|title|role|position)\s*[:\-]\s*/i, "").trim();
    if (t.length <= 90 && TITLE_RE.test(t) && !/[.!?]$/.test(t) && !classifyHeader(t)) return t;
  }
  const m = lines.join("\n").match(/\b(?:hiring|seeking|looking for)\s+(?:an?\s+)?([A-Z][\w/+#. -]{3,60}?(?:Engineer|Developer|Scientist|Analyst|Manager|Designer|Architect))/);
  return m ? m[1].trim() : null;
}

function detectSeniority(title: string | null, years: number | null, text: string): Seniority {
  const t = (title ?? "").toLowerCase();
  if (/\bintern(ship)?\b|co-?op\b/.test(t)) return "intern";
  if (/\b(staff|principal|distinguished|fellow)\b/.test(t)) return "staff_plus";
  if (/\b(engineering manager|manager|director|head of|vp)\b/.test(t)) return "manager";
  if (/\b(senior|sr\.?|lead|iii|iv)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry|graduate|new grad|associate|i)\b/.test(t)) return "entry";
  if (/\b(mid|ii)\b/.test(t)) return "mid";
  if (years !== null) {
    if (years >= 8) return "staff_plus";
    if (years >= 5) return "senior";
    if (years >= 2) return "mid";
    return "entry";
  }
  if (/\b(new grad|recent graduate|entry[- ]level|0-2 years)\b/i.test(text)) return "entry";
  return "unknown";
}

function detectRoleFamily(title: string | null, catWeights: Map<SkillCategory, number>): string {
  const t = (title ?? "").toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(ml|machine learning|ai|llm|genai|applied scientist)\b/, "ai_ml_engineering"],
    [/\bdata (scientist|analyst)\b|analytics/, "data_science_analytics"],
    [/\bdata engineer/, "data_engineering"],
    [/\b(sre|site reliability|devops|platform engineer|infrastructure engineer|cloud engineer)\b/, "devops_platform"],
    [/\b(security|appsec|cyber)/, "security"],
    [/\b(qa|sdet|test|quality)\b/, "qa_testing"],
    [/\b(ios|android|mobile)\b/, "mobile"],
    [/\b(front[- ]?end|ui engineer|web developer)\b/, "frontend"],
    [/\b(back[- ]?end|api)\b/, "backend"],
    [/\bfull[- ]?stack\b/, "fullstack"],
    [/\b(embedded|firmware)\b/, "embedded"],
    [/\bproduct manager\b/, "product_management"],
    [/\b(designer|ux|ui\/ux)\b/, "design"],
    [/\b(engineer|developer|programmer|swe)\b/, "software_engineering"],
  ];
  for (const [re, fam] of rules) if (re.test(t)) return fam;
  const hard = [...catWeights.entries()].filter(([c]) => HARD_CATEGORIES.has(c)).reduce((a, [, w]) => a + w, 0);
  const total = [...catWeights.values()].reduce((a, w) => a + w, 0) || 1;
  return hard / total > 0.45 ? "software_engineering" : "general_professional";
}

const EDUCATION_RE =
  /\b(bachelor'?s?|master'?s?|ph\.?d|doctorate|b\.?s\.?c?|m\.?s\.?c?|b\.?tech|m\.?tech|b\.?e\.?|mba|associate'?s degree|degree)\b[^.\n]{0,90}/gi;

const CERT_PATTERNS = [
  /\bAWS Certified [A-Z][\w -]+/g,
  /\b(?:Microsoft Certified|Azure) [A-Z][\w -]*?(?:Associate|Expert|Fundamentals)\b/g,
  /\bAZ-\d{3}\b/g,
  /\bGoogle (?:Cloud )?Professional [A-Z][\w ]+/g,
  /\b(CKA|CKAD|CKS|CISSP|CISM|CISA|OSCP|CEH|PMP|CAPM|CSM|PSM|CPA|CFA|CFP|SHRM-CP|SHRM-SCP|ITIL|Six Sigma(?: Green| Black)? ?Belt|Security\+|Network\+|A\+|CCNA|CCNP|RHCE|RHCSA|TOGAF)\b/g,
];

const IMPLIED_RULES: { when: (a: { seniority: Seniority; skills: Set<string>; text: string }) => boolean; expect: string }[] = [
  { when: (a) => ["senior", "staff_plus"].includes(a.seniority), expect: "Show ownership of systems end-to-end, technical decision-making, and mentoring (senior roles are screened for scope, not just tasks)." },
  { when: (a) => a.seniority === "staff_plus", expect: "Show cross-team influence: architecture decisions, RFCs/design docs, org-wide standards." },
  { when: (a) => a.seniority === "manager", expect: "Show team size, hiring, delivery outcomes, and people development." },
  { when: (a) => ["intern", "entry"].includes(a.seniority), expect: "Projects, coursework, internships and hackathons carry the weight — lead with shipped projects that use the JD's stack." },
  { when: (a) => a.skills.has("Distributed Systems") || a.skills.has("Scalability") || a.skills.has("System Design"), expect: "Quantify scale: requests/sec, users, data volume, latency (p95/p99), uptime." },
  { when: (a) => a.skills.has("Incident Management") || a.skills.has("Site Reliability Engineering"), expect: "Mention on-call, incident response, MTTR/uptime improvements." },
  { when: (a) => /\bstartup|fast[- ]paced|0 to 1|zero to one|early[- ]stage\b/i.test(a.text), expect: "Emphasize speed, ownership across the stack, and shipping 0→1 with minimal direction." },
  { when: (a) => /\b(customer|client|user)[- ]facing\b|\bcustomers?\b/i.test(a.text), expect: "Tie work to customer/user outcomes (adoption, retention, NPS, support tickets)." },
  { when: (a) => [...a.skills].some((s) => ["Large Language Models", "Generative AI", "AI Agents", "Retrieval-Augmented Generation"].includes(s)), expect: "Show a shipped LLM feature with evaluation (evals, latency, cost per request) — not just API calls." },
  { when: (a) => /\bregulated|compliance|hipaa|soc ?2|pci|gdpr|fintech|bank|healthcare\b/i.test(a.text), expect: "Signal care with data: security, compliance, auditability, privacy." },
  { when: (a) => /\bremote\b/i.test(a.text), expect: "Signal async, written communication and self-direction (remote-friendly)." },
];

export function analyzeJobDescription(jdText: string, opts: { title?: string; company?: string } = {}): JDAnalysis {
  const text = normalizeWhitespace(jdText);
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 1. Assign each line to a section.
  const tagged: { line: string; section: SectionKind; offset: number }[] = [];
  let current: SectionKind = "unknown";
  let offset = 0;
  for (const raw of rawLines) {
    const start = text.indexOf(raw, offset);
    offset = start >= 0 ? start + raw.length : offset;
    const line = raw.replace(/^\s*([-*•●▪◦·>]|\d+[.)])\s+/, "");
    if (isHeader(line)) {
      const kind = classifyHeader(line);
      if (kind) {
        current = kind;
        continue;
      }
    }
    // Paragraph-style JDs: judge each sentence on its own ("…required. HubSpot is a plus.").
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) tagged.push({ line: sentence, section: current, offset: start });
  }

  const title = detectTitle(rawLines, opts.title);

  // 2. Years of experience.
  const yearsMatches = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(\d{1,2})?\s*\+?\s*years?/gi)];
  const yearsVals = yearsMatches.map((m) => Number(m[1])).filter((n) => n > 0 && n < 30);
  const years_required = yearsVals.length ? Math.min(...yearsVals) : null;

  // 3. Skill keywords, weighted by where they appear.
  type Agg = { hit: SkillHit; weight: number; sections: Set<SectionKind>; cues: Set<"req" | "pref">; years?: number };
  const agg = new Map<string, Agg>();
  const titleHits = title ? findSkills(title) : new Map<string, SkillHit>();
  for (const [name, hit] of titleHits) {
    agg.set(name, { hit, weight: SECTION_WEIGHT.title, sections: new Set(["title"]), cues: new Set(["req"]) });
  }
  for (const { line, section } of tagged) {
    const hits = findSkills(line);
    const lineYears = line.match(/(\d{1,2})\s*\+?\s*years?/i);
    for (const [name, hit] of hits) {
      let entry = agg.get(name);
      if (!entry) {
        entry = { hit: { ...hit, count: 0, matchedTerms: [], positions: [] }, weight: 0, sections: new Set(), cues: new Set() };
        agg.set(name, entry);
      }
      const prior = entry.hit.count;
      entry.hit.count += hit.count;
      entry.hit.matchedTerms = unique([...entry.hit.matchedTerms, ...hit.matchedTerms]);
      // Diminishing returns on repetition: 1st mention full weight, then 0.5 each.
      const base = SECTION_WEIGHT[section];
      entry.weight += prior === 0 ? base : base * 0.5;
      entry.sections.add(section);
      if (REQUIRED_CUE.test(line)) entry.cues.add("req");
      if (PREFERRED_CUE.test(line)) entry.cues.add("pref");
      if (lineYears) entry.years = Math.max(entry.years ?? 0, Number(lineYears[1]));
    }
  }

  const keywords: JDKeyword[] = [...agg.entries()]
    .filter(([, e]) => e.weight > 0)
    .map(([name, e]) => {
      const inReq = e.sections.has("required") || e.sections.has("title");
      const onlyPref = e.sections.size === 1 && e.sections.has("preferred");
      let importance: Importance;
      if (inReq || (e.cues.has("req") && !e.cues.has("pref"))) importance = "must_have";
      else if (onlyPref || (e.cues.has("pref") && !e.cues.has("req"))) importance = "nice_to_have";
      // No section structure: anything named without a "nice to have" cue is effectively required.
      else if (e.sections.has("unknown")) importance = "must_have";
      else if (e.sections.has("responsibilities")) importance = e.hit.count >= 2 ? "must_have" : "contextual";
      else importance = "contextual";
      if (e.hit.skill.category === "soft_skill" && importance === "must_have" && !inReq) importance = "contextual";
      const weight = Math.round((e.weight + (e.years ? 1.5 : 0) + (importance === "must_have" ? 1 : 0)) * 10) / 10;
      return {
        skill: name,
        category: e.hit.skill.category,
        importance,
        weight,
        count: e.hit.count,
        jd_terms: e.hit.matchedTerms,
        write_as: atsPhrasing(e.hit.skill, e.hit.matchedTerms),
        ...(e.years ? { years: e.years } : {}),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  // Business-domain terms ("reconciliation" → Accounting) in a technical JD are context, not skills to claim.
  const technical = keywords.filter((k) => HARD_CATEGORIES.has(k.category)).length >= 5;
  const businessContext = technical ? keywords.filter((k) => k.category === "business" && k.importance !== "must_have") : [];
  for (const k of businessContext) keywords.splice(keywords.indexOf(k), 1);

  // 4. Category emphasis — where the JD's attention is.
  const catWeights = new Map<SkillCategory, number>();
  for (const k of keywords) catWeights.set(k.category, (catWeights.get(k.category) ?? 0) + k.weight);
  const totalW = [...catWeights.values()].reduce((a, b) => a + b, 0) || 1;
  const category_emphasis = [...catWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, w]) => ({ category: CATEGORY_LABELS[c], share: Math.round((w / totalW) * 100) }))
    .filter((c) => c.share > 0);

  // 5. Focus points — the JD lines carrying the most keyword weight.
  const kwWeight = new Map(keywords.map((k) => [k.skill, k.weight]));
  const focusCandidates = tagged
    .filter((t) => ["required", "responsibilities", "unknown", "preferred"].includes(t.section))
    .filter((t) => t.line.split(/\s+/).length >= 4)
    .map((t) => {
      const skills = [...findSkills(t.line).keys()];
      const w = skills.reduce((a, s) => a + (kwWeight.get(s) ?? 0), 0) * (SECTION_WEIGHT[t.section] / 2) + (REQUIRED_CUE.test(t.line) ? 1 : 0);
      return { statement: t.line, section: t.section, skills, weight: Math.round(w * 10) / 10 };
    })
    .filter((f) => f.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const focus_points: FocusPoint[] = focusCandidates.slice(0, 10).map((f, i) => ({ rank: i + 1, ...f }));

  const toPast = (w: string) =>
    IRREGULAR_PAST[w] ?? [w + "ed", w + "d", w.replace(/y$/, "ied"), w].find((c) => ALL_ACTION_VERBS.has(c)) ?? "";
  const responsibilities = tagged.filter((t) => t.section === "responsibilities").map((t) => t.line);
  const action_verbs_to_mirror = unique(
    [...responsibilities, ...tagged.filter((t) => t.section === "unknown").map((t) => t.line)]
      .map((l) => l.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ""))
      .filter((w): w is string => !!w)
      .map(toPast)
      .filter(Boolean),
  ).slice(0, 12);

  const knownTerms = new Set(keywords.flatMap((k) => [k.skill.toLowerCase(), ...k.jd_terms.map((t) => t.toLowerCase())]));
  const domain_terms = [...businessContext.flatMap((k) => k.jd_terms.map((t) => t.toLowerCase())), ...salientPhrases(
    tagged.filter((t) => t.section !== "benefits" && t.section !== "about").map((t) => t.line).join("\n"),
    40,
  )
    .map((p) => p.phrase)
    .filter((p) => !knownTerms.has(p) && ![...knownTerms].some((k) => p.includes(k) || k.includes(p)))
    .filter((p) => p.length > 3 && !GENERIC_TERMS.has(p))].slice(0, 15);

  const education = unique(
    [...text.matchAll(EDUCATION_RE)]
      .map((m) => m[0].trim().replace(/\s+/g, " "))
      .filter((e) => /computer|engineering|science|math|technical|related|equivalent|field|degree|business|finance|design/i.test(e)),
  ).slice(0, 4);

  const certifications = unique(CERT_PATTERNS.flatMap((re) => [...text.matchAll(re)].map((m) => m[0].trim()))).slice(0, 10);

  const seniority = detectSeniority(title, years_required, text);
  const skillSet = new Set(keywords.map((k) => k.skill));
  const implied_expectations = IMPLIED_RULES.filter((r) => r.when({ seniority, skills: skillSet, text })).map((r) => r.expect);

  return {
    title,
    company: opts.company?.trim() || detectCompany(text),
    seniority,
    role_family: detectRoleFamily(title, catWeights),
    years_required,
    education,
    certifications,
    keywords,
    must_have: keywords.filter((k) => k.importance === "must_have").map((k) => k.skill),
    nice_to_have: keywords.filter((k) => k.importance === "nice_to_have").map((k) => k.skill),
    focus_points,
    category_emphasis,
    responsibilities,
    action_verbs_to_mirror,
    soft_skills: keywords.filter((k) => k.category === "soft_skill").map((k) => k.skill),
    domain_terms,
    implied_expectations,
    word_count: text.split(/\s+/).length,
  };
}

const GENERIC_TERMS = new Set(
  "backend frontend design pipelines pipeline systems system services service engineering software platform features feature product products engineers engineer teams development developer code data solutions tools technical technology environment customers customer users user business".split(" "),
);

function detectCompany(text: string): string | null {
  const m =
    text.match(/\bAbout\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s*[:\n]/) ??
    text.match(/\bAt\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,2}),\s+we\b/) ??
    text.match(/\bjoin\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,2})(?:'s)?\s+(?:team|as|in)\b/);
  const name = m?.[1]?.trim();
  if (!name || /^(Us|The|You|Our|This|The Team|The Role)$/i.test(name)) return null;
  return name;
}
