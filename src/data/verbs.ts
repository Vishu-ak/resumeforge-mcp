/** Strong action verbs grouped by the signal they send to a recruiter. */
export const ACTION_VERBS: Record<string, string[]> = {
  build: [
    "architected", "built", "designed", "developed", "engineered", "implemented", "created",
    "launched", "shipped", "prototyped", "programmed", "coded", "deployed", "integrated",
    "constructed", "authored", "established", "founded", "introduced", "delivered",
  ],
  improve: [
    "optimized", "improved", "accelerated", "reduced", "increased", "boosted", "streamlined",
    "refactored", "modernized", "migrated", "automated", "scaled", "upgraded", "enhanced",
    "consolidated", "simplified", "stabilized", "hardened", "cut", "eliminated", "doubled", "tripled",
  ],
  lead: [
    "led", "spearheaded", "directed", "drove", "owned", "championed", "managed", "mentored",
    "coached", "coordinated", "orchestrated", "headed", "guided", "onboarded", "hired", "supervised",
  ],
  analyze: [
    "analyzed", "investigated", "diagnosed", "debugged", "identified", "evaluated", "assessed",
    "researched", "benchmarked", "measured", "modeled", "forecasted", "audited", "profiled", "tested",
  ],
  collaborate: [
    "collaborated", "partnered", "aligned", "negotiated", "presented", "communicated",
    "facilitated", "influenced", "advised", "consulted", "documented", "trained",
  ],
  achieve: [
    "achieved", "exceeded", "won", "earned", "generated", "saved", "secured", "grew", "closed",
    "attained", "surpassed", "resolved",
  ],
};

export const ALL_ACTION_VERBS: ReadonlySet<string> = new Set(Object.values(ACTION_VERBS).flat());

/** Phrases that make a bullet read as passive or low-ownership. */
export const WEAK_PHRASES = [
  "responsible for",
  "worked on",
  "helped with",
  "helped to",
  "assisted with",
  "assisted in",
  "involved in",
  "participated in",
  "tasked with",
  "duties included",
  "in charge of",
  "familiar with",
  "exposure to",
  "various",
  "etc",
  "successfully",
  "hard-working",
  "go-getter",
  "team player",
  "detail-oriented",
  "synergy",
  "think outside the box",
];

/** Buzzwords recruiters skim past; flag them in summaries. */
export const CLICHES = [
  "results-driven",
  "results driven",
  "passionate",
  "dynamic",
  "motivated individual",
  "proven track record",
  "seasoned professional",
  "rockstar",
  "ninja",
  "guru",
  "best of breed",
  "self-starter",
];

/** Standard section headings every major ATS (Workday, Greenhouse, Lever, Taleo, iCIMS) parses. */
export const STANDARD_HEADINGS = [
  "Summary",
  "Professional Summary",
  "Skills",
  "Technical Skills",
  "Experience",
  "Work Experience",
  "Professional Experience",
  "Projects",
  "Education",
  "Certifications",
  "Awards",
  "Publications",
  "Volunteer Experience",
  "Leadership",
];

/** Present-tense → past-tense for verbs where "+ed" doesn't work. */
export const IRREGULAR_PAST: Record<string, string> = {
  build: "built", lead: "led", drive: "drove", ship: "shipped", run: "ran", write: "authored",
  make: "created", own: "owned", partner: "partnered", mentor: "mentored", scale: "scaled",
  win: "won", grow: "grew", cut: "cut", set: "established", take: "led", bring: "delivered",
};

/**
 * True if `word` is a strong action verb in any common resume form:
 * "Built", "Re-architected", "Co-led", or "Building" (in-progress projects).
 */
export function isActionVerb(word: string | undefined): boolean {
  if (!word) return false;
  const w = word.toLowerCase().replace(/[^a-z-]/g, "").replace(/^(re|co|pre)-?/, "").replace(/-/g, "");
  if (ALL_ACTION_VERBS.has(w)) return true;
  if (/ing$/.test(w)) {
    const stem = w.slice(0, -3);
    const cands = [stem, stem + "e", stem.replace(/(.)\1$/, "$1")];
    return cands.some((c) => ALL_ACTION_VERBS.has(IRREGULAR_PAST[c] ?? "") || ALL_ACTION_VERBS.has(c + "ed") || ALL_ACTION_VERBS.has(c + "d"));
  }
  return /(ed)$/.test(w) && (ALL_ACTION_VERBS.has(w) || ["architected", "rearchitected", "containerized", "instrumented", "provisioned", "productionized", "parallelized", "debugged"].includes(w));
}
