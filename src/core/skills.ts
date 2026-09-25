import { SKILLS, type SkillDef } from "../data/skills.js";
import { escapeRegex } from "./text.js";

export interface SkillHit {
  skill: SkillDef;
  /** Number of distinct occurrences in the text. */
  count: number;
  /** The literal terms that matched (e.g. "k8s" for Kubernetes). */
  matchedTerms: string[];
  /** Character offsets of each occurrence. */
  positions: number[];
}

interface CompiledTerm {
  skill: SkillDef;
  term: string;
  re: RegExp;
}

const LEFT = "(?<![A-Za-z0-9_+#.])";
const RIGHT = "(?![A-Za-z0-9_+#])(?!\\.[A-Za-z0-9])";

function compile(skill: SkillDef, term: string): CompiledTerm {
  const flags = skill.caseSensitive ? "g" : "gi";
  // Single-letter languages ("C", "R") must not be part of "C-suite", "R&D", "Series C".
  const extraRight = term.length === 1 ? "(?![-'&])" : "";
  const extraLeft = term.length === 1 ? "(?<![-&]|Series |Plan |Grade |Class |Type )" : "";
  return {
    skill,
    term,
    re: new RegExp(`${LEFT}${extraLeft}${escapeRegex(term)}${RIGHT}${extraRight}`, flags),
  };
}

const COMPILED: CompiledTerm[] = SKILLS.flatMap((skill) =>
  [skill.name, ...skill.aliases].map((t) => compile(skill, t)),
);

const BY_TERM = new Map<string, SkillDef>();
for (const skill of SKILLS) {
  for (const t of [skill.name, ...skill.aliases]) {
    const key = t.toLowerCase();
    if (!BY_TERM.has(key)) BY_TERM.set(key, skill);
  }
}

/** Short case-sensitive words ("Go") are ignored at the start of a sentence ("Go beyond…"). */
function atSentenceStart(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 3), index);
  return index === 0 || /(^|[.!?:\n])\s*$/.test(before);
}

export function findSkills(text: string): Map<string, SkillHit> {
  const hits = new Map<string, SkillHit>();
  for (const { skill, term, re } of COMPILED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (skill.caseSensitive && m[0].length <= 2 && atSentenceStart(text, m.index)) continue;
      let hit = hits.get(skill.name);
      if (!hit) {
        hit = { skill, count: 0, matchedTerms: [], positions: [] };
        hits.set(skill.name, hit);
      }
      // Overlapping matches of the same skill ("node" inside "node.js") count once.
      const overlaps = hit.positions.some((p) => Math.abs(p - m!.index) < Math.max(term.length, 3));
      if (overlaps) continue;
      hit.positions.push(m.index);
      hit.count++;
      if (!hit.matchedTerms.includes(m[0])) hit.matchedTerms.push(m[0]);
    }
  }
  return hits;
}

/**
 * Using a specific tool is evidence of the umbrella skill: MySQL → SQL,
 * Jenkins → CI/CD, Kafka → Event-Driven Architecture. Never the reverse.
 */
const IMPLIES: Record<string, string[]> = {
  SQL: ["MySQL", "PostgreSQL", "SQL Server", "Oracle Database", "SQLite", "Snowflake", "BigQuery", "Amazon Redshift", "ClickHouse"],
  "CI/CD": ["Jenkins", "GitHub Actions", "GitLab CI", "CircleCI", "ArgoCD", "Azure DevOps"],
  "Event-Driven Architecture": ["Apache Kafka", "RabbitMQ", "Amazon SQS"],
  NoSQL: ["MongoDB", "DynamoDB", "Cassandra", "Redis", "Firebase"],
  AWS: ["AWS Lambda", "Amazon EC2", "Amazon S3", "Amazon ECS", "Amazon EKS", "Amazon RDS", "DynamoDB", "Amazon SQS", "CloudFormation"],
  "Microsoft Azure": ["Azure Functions", "Azure DevOps"],
  "Google Cloud Platform": ["BigQuery", "Google Kubernetes Engine", "Cloud Run"],
  Docker: ["Kubernetes", "Amazon ECS", "Amazon EKS"],
  "Infrastructure as Code": ["Terraform", "Pulumi", "CloudFormation", "Ansible"],
  JavaScript: ["TypeScript", "React", "Node.js", "Vue.js", "Angular", "Next.js"],
  "Machine Learning": ["scikit-learn", "PyTorch", "TensorFlow", "XGBoost"],
  "Unit Testing": ["Jest", "Vitest", "JUnit", "pytest", "Mocha"],
  "Test Automation": ["Cypress", "Playwright", "Selenium"],
  Observability: ["Prometheus", "Grafana", "Datadog", "New Relic", "Splunk", "OpenTelemetry"],
  "Large Language Models": ["OpenAI API", "Anthropic Claude API", "LangChain", "LlamaIndex"],
};

/** Returns the skills plus every umbrella skill they imply. */
export function withImplied(skills: Iterable<string>): Set<string> {
  const out = new Set(skills);
  for (const [umbrella, specifics] of Object.entries(IMPLIES)) {
    if (specifics.some((s) => out.has(s))) out.add(umbrella);
  }
  return out;
}

/** Which of `have` imply `skill` (e.g. "SQL" ← ["MySQL"]). */
export function impliedBy(skill: string, have: Iterable<string>): string[] {
  const set = new Set(have);
  return (IMPLIES[skill] ?? []).filter((s) => set.has(s));
}

/** Map a free-form term (e.g. "k8s", "postgres") to its canonical skill, if known. */
export function canonicalSkill(term: string): SkillDef | undefined {
  return BY_TERM.get(term.trim().toLowerCase());
}

/** True if `text` mentions the skill (by canonical name or any alias). */
export function textHasSkill(text: string, skillName: string): boolean {
  return findSkills(text).has(skillName);
}

/**
 * ATS systems are literal. A resume that says "k8s" may not match a JD that says
 * "Kubernetes". Returns the exact phrasing to use, including acronym expansion.
 */
export function atsPhrasing(skill: SkillDef, jdTerms: string[]): string {
  const raw = jdTerms.find((t) => t.toLowerCase() !== skill.name.toLowerCase());
  if (!raw) return skill.name;
  const jdTerm =
    raw === raw.toLowerCase() && raw.length > 4
      ? raw.replace(/\b[a-z]/g, (c) => c.toUpperCase())
      : raw;
  // Write both forms so either literal search hits: "Amazon Web Services (AWS)".
  const [long, short] =
    jdTerm.length > skill.name.length ? [jdTerm, skill.name] : [skill.name, jdTerm];
  return `${long} (${short})`;
}
