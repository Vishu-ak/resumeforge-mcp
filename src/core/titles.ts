import type { ParsedRole } from "./roles.js";

/**
 * Internal/company-specific titles → the market title recruiters search for.
 * Output keeps the official title in parentheses so employment verification
 * still matches: "Software Engineer (Member of Technical Staff)".
 */
const RULES: { re: RegExp; market: string; note: string; onlyIfSoftware?: boolean }[] = [
  { re: /\b(software|web|application|backend|frontend|full[- ]?stack)?\s*(developer|programmer|engineering)\s+intern\b|\bsde intern\b/i, market: "Software Engineer Intern", note: "Recruiters search 'Software Engineer Intern'.", onlyIfSoftware: true },
  { re: /\bmember of technical staff\b|\bmts\b/i, market: "Software Engineer", note: "MTS is a software engineering title at many companies." },
  { re: /\bsoftware development engineer\b|\bsde\b/i, market: "Software Engineer", note: "SDE is widely understood, but most searches use 'Software Engineer'." },
  { re: /\b(programmer analyst|associate consultant|technology analyst|systems engineer|senior systems engineer|application development (analyst|associate)|associate software engineer|associate engineer|software engineer trainee|graduate engineer trainee|get)\b/i, market: "Software Engineer", note: "Common IT-services title; recruiters search for 'Software Engineer'.", onlyIfSoftware: true },
  { re: /\b(technical lead|tech lead|team lead)\b/i, market: "Senior Software Engineer", note: "Shows seniority while keeping the lead responsibility visible.", onlyIfSoftware: true },
  { re: /\b(web developer|application developer|software developer|developer)\b/i, market: "Software Engineer", note: "Many ATS searches match 'Engineer', not 'Developer'.", onlyIfSoftware: true },
  { re: /\b(coder|programmer)\b/i, market: "Software Engineer", note: "'Programmer' reads as junior; 'Software Engineer' is the searched title.", onlyIfSoftware: true },
  { re: /\b(trainee|apprentice)\b/i, market: "Software Engineer Intern", note: "Trainee programs map to internships.", onlyIfSoftware: true },
];

const LEVEL = /\b(I{1,3}|IV|[1-4]|senior|sr\.?|junior|jr\.?|staff|principal|lead)\b/;
const SOFTWARE_EVIDENCE = /\b(api|apis|microservices?|backend|frontend|code|coded|developed|built|deployed|java|python|javascript|typescript|go|react|sql|aws|docker|kubernetes|spring|node)\b/i;

export interface TitleTranslation {
  original: string;
  company: string;
  suggested: string;
  reason: string;
}

const SPECIALTY_EVIDENCE: Record<string, RegExp> = {
  Backend: /\b(apis?|microservices?|backend|server|spring|django|express|fastapi|database|rest(ful)?|grpc)\b/i,
  Frontend: /\b(react|angular|vue|frontend|ui|css|next\.js|typescript)\b/i,
  "Full Stack": /\b(react|angular|vue|frontend)\b[\s\S]*\b(apis?|backend|server|database)\b|\b(apis?|backend|server|database)\b[\s\S]*\b(react|angular|vue|frontend)\b/i,
  Mobile: /\b(ios|android|mobile|react native|flutter|swift|kotlin)\b/i,
  Platform: /\b(kubernetes|docker|terraform|ci\/cd|infrastructure|platform|pipelines?)\b/i,
  Infrastructure: /\b(kubernetes|docker|terraform|ci\/cd|infrastructure|aws|gcp|azure)\b/i,
  Cloud: /\b(aws|gcp|azure|cloud|kubernetes|terraform)\b/i,
  Devops: /\b(ci\/cd|jenkins|docker|kubernetes|terraform|pipelines?|deploy)\b/i,
  Data: /\b(etl|pipelines?|spark|airflow|warehouse|sql|analytics|dbt)\b/i,
  Ml: /\b(model|ml|machine learning|pytorch|tensorflow|scikit)\b/i,
  "Machine learning": /\b(model|ml|machine learning|pytorch|tensorflow|scikit)\b/i,
  Payments: /\b(payments?|transactions?|lending|loans?|disbursement|fintech|ledger|settlement)\b/i,
  Security: /\b(security|auth|iam|owasp|encryption)\b/i,
};

function specialty(jdTitle: string | null): string | null {
  const m = (jdTitle ?? "").match(/\b(backend|back-end|frontend|front-end|full[- ]?stack|mobile|platform|data|ml|machine learning|infrastructure|payments|cloud|devops|security)\b/i);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace("back-end", "backend").replace("front-end", "frontend").replace(/full[- ]?stack/, "full stack");
  return raw === "full stack" ? "Full Stack" : raw.replace(/^\w/, (c) => c.toUpperCase());
}

export function translateTitles(roles: ParsedRole[], jdTitle: string | null): TitleTranslation[] {
  const out: TitleTranslation[] = [];
  const spec = specialty(jdTitle);
  for (const r of roles) {
    if (!r.title) continue;
    const isSoftware = SOFTWARE_EVIDENCE.test(r.text);
    const rule = RULES.find((x) => x.re.test(r.title) && (!x.onlyIfSoftware || isSoftware));
    const level = r.title.match(LEVEL)?.[1];
    const specialtyApplies = !!spec && (SPECIALTY_EVIDENCE[spec]?.test(r.text) ?? false) && !new RegExp(spec, "i").test(r.title);
    if (rule && !new RegExp(`^${rule.market}\\b`, "i").test(r.title)) {
      const market = level && /^(I{1,3}|IV|[1-4])$/.test(level) ? `${rule.market} ${level}` : rule.market;
      // "Software Developer Intern (Capstone)" → "Software Engineer Intern (Capstone)": keep the qualifier, don't nest parentheses.
      const qualifier = r.title.match(/\(([^)]+)\)\s*$/)?.[1];
      const bare = r.title.replace(/\s*\([^)]*\)\s*$/, "");
      const suggested = qualifier ? `${market} (${qualifier})` : `${market} (${bare})`;
      out.push({ original: r.title, company: r.company, suggested, reason: rule.note });
    } else if (specialtyApplies) {
      out.push({
        original: r.title,
        company: r.company,
        suggested: `${r.title} (${spec})`,
        reason: `Your work in this role matches the JD's ${spec} focus. Naming the specialty helps both ATS title matching and recruiters.`,
      });
    }
  }
  return out;
}
