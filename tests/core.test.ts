import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { suggestBridgeProjects } from "../src/core/bridge.js";
import { extractDateRanges, totalMonths } from "../src/core/dates.js";
import { analyzeGaps } from "../src/core/gap.js";
import { normalizeLinkedIn, validateIntake } from "../src/core/intake.js";
import { analyzeJobDescription } from "../src/core/jd.js";
import { scoreResume } from "../src/core/score.js";
import { atsPhrasing, canonicalSkill, findSkills, withImplied } from "../src/core/skills.js";
import { isActionVerb } from "../src/data/verbs.js";
import { Resume } from "../src/schemas.js";

const ex = (f: string) => readFileSync(fileURLToPath(new URL(`../examples/${f}`, import.meta.url)), "utf8");
const JD = ex("sample-jd.txt");
const RESUME = ex("sample-resume.txt");
const LINKEDIN = ex("sample-linkedin.txt");
const TAILORED = Resume.parse(JSON.parse(ex("sample-tailored-resume.json")));

describe("skill matching", () => {
  it("matches aliases to canonical names", () => {
    const hits = findSkills("We use k8s, Postgres, and Node.js with TS-free JS on Amazon Web Services.");
    expect([...hits.keys()]).toEqual(expect.arrayContaining(["Kubernetes", "PostgreSQL", "Node.js", "JavaScript", "AWS"]));
  });

  it("does not confuse Java with JavaScript or C with C-suite", () => {
    expect(findSkills("Strong JavaScript skills").has("Java")).toBe(false);
    expect(findSkills("Present to the C-suite and Series C investors").has("C")).toBe(false);
    expect(findSkills("Embedded C and C++ firmware").has("C")).toBe(true);
  });

  it("ignores 'Go' as an English verb at sentence start but matches the language", () => {
    expect(findSkills("Go beyond expectations.").has("Go")).toBe(false);
    expect(findSkills("Services written in Go and Rust").has("Go")).toBe(true);
    expect(findSkills("golang microservices").has("Go")).toBe(true);
  });

  it("does not treat common English words as skills", () => {
    const hits = findSkills("Express your ideas, rest assured, a solid strategy for operations");
    expect(hits.has("Express.js")).toBe(false);
    expect(hits.has("REST APIs")).toBe(false);
    expect(hits.has("Design Patterns")).toBe(false);
  });

  it("writes both acronym and long form for ATS", () => {
    expect(atsPhrasing(canonicalSkill("aws")!, ["Amazon Web Services"])).toBe("Amazon Web Services (AWS)");
    expect(atsPhrasing(canonicalSkill("rag")!, ["RAG"])).toBe("Retrieval-Augmented Generation (RAG)");
  });

  it("derives umbrella skills from specific tools", () => {
    const s = withImplied(["MySQL", "Jenkins", "RabbitMQ"]);
    expect(s.has("SQL")).toBe(true);
    expect(s.has("CI/CD")).toBe(true);
    expect(s.has("Event-Driven Architecture")).toBe(true);
    expect(withImplied(["SQL"]).has("MySQL")).toBe(false);
  });
});

describe("action verbs", () => {
  it("accepts past tense, prefixed and in-progress forms", () => {
    for (const w of ["Built", "Re-architected", "Designed", "Building", "Optimizing", "Led"]) expect(isActionVerb(w)).toBe(true);
    for (const w of ["Responsible", "Worked", "The"]) expect(isActionVerb(w)).toBe(false);
  });
});

describe("dates", () => {
  it("parses ranges and sums non-overlapping months", () => {
    const r = extractDateRanges("Engineer | Acme | Jan 2020 - Dec 2020\nIntern | Foo | 06/2020 - 03/2021", new Date(2024, 0, 1));
    expect(r).toHaveLength(2);
    expect(totalMonths(r)).toBe(14);
  });
});

describe("JD analysis", () => {
  const jd = analyzeJobDescription(JD);

  it("detects title, company, seniority, role family and years", () => {
    expect(jd.title).toMatch(/Senior Backend Engineer/);
    expect(jd.company).toBe("Ledgerly");
    expect(jd.seniority).toBe("senior");
    expect(jd.role_family).toBe("backend");
    expect(jd.years_required).toBe(5);
  });

  it("separates must-haves from nice-to-haves by section", () => {
    expect(jd.must_have).toEqual(expect.arrayContaining(["Go", "Apache Kafka", "PostgreSQL", "Kubernetes", "gRPC"]));
    expect(jd.nice_to_have).toEqual(expect.arrayContaining(["Terraform", "OpenTelemetry"]));
    expect(jd.must_have).not.toContain("Terraform");
  });

  it("ignores benefits and moves business-domain words out of the skill list", () => {
    expect(jd.keywords.find((k) => k.skill === "Accounting")).toBeUndefined();
    expect(jd.domain_terms).toContain("payments");
  });

  it("ranks focus points and extracts verbs to mirror", () => {
    expect(jd.focus_points.length).toBeGreaterThan(3);
    expect(jd.focus_points[0].weight).toBeGreaterThanOrEqual(jd.focus_points[1].weight);
    expect(jd.action_verbs_to_mirror).toEqual(expect.arrayContaining(["designed", "built", "mentored"]));
    expect(jd.implied_expectations.some((e) => /ownership/i.test(e))).toBe(true);
  });

  it("handles an unstructured, non-technical JD", () => {
    const hr = analyzeJobDescription(
      "Marketing Manager\nWe are hiring a Marketing Manager to own our SEO and content marketing strategy. " +
        "You will manage a budget, run paid media campaigns on Google Ads, report KPIs to leadership and collaborate with sales. " +
        "3+ years of digital marketing experience required. Excellent communication skills. HubSpot experience is a plus.",
    );
    expect(hr.title).toBe("Marketing Manager");
    expect(hr.must_have).toEqual(expect.arrayContaining(["SEO", "Digital Marketing"]));
    expect(hr.keywords.find((k) => k.skill === "HubSpot")?.importance).toBe("nice_to_have");
    expect(hr.role_family).toBe("general_professional");
  });
});

describe("intake gate", () => {
  const base = {
    full_name: "Priya Raman",
    email: "priya.raman.dev@example.com",
    phone: "+91 98450 12345",
    location: "Bengaluru, India",
    linkedin_url: "linkedin.com/in/priya-raman-dev",
    current_resume_text: RESUME,
  };

  it("is not ready without LinkedIn URL", () => {
    const r = validateIntake({ ...base, linkedin_url: undefined });
    expect(r.ready).toBe(false);
    expect(r.missing_required).toContain("LinkedIn profile URL");
  });

  it("rejects non-profile LinkedIn URLs", () => {
    expect(normalizeLinkedIn("https://www.linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedIn("linkedin.com/in/jane-doe/")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(validateIntake({ ...base, linkedin_url: "linkedin.com/feed" }).ready).toBe(false);
  });

  it("asks for LinkedIn content when only the URL is given", () => {
    const r = validateIntake(base);
    expect(r.ready).toBe(true);
    expect(r.linkedin.profile_text_provided).toBe(false);
    expect(r.questions_to_ask.join(" ")).toMatch(/LinkedIn profile text/);
  });

  it("finds skills that are on LinkedIn but missing from the resume", () => {
    const r = validateIntake({ ...base, linkedin_profile_text: LINKEDIN });
    expect(r.linkedin.skills_on_linkedin_not_resume).toEqual(expect.arrayContaining(["Go", "PostgreSQL", "Kubernetes"]));
    expect(r.linkedin.resume_roles_missing_on_linkedin).toEqual([]);
    expect(r.linkedin.name_matches).toBe(true);
  });

  it("flags roles that are on the resume but not LinkedIn", () => {
    const r = validateIntake({ ...base, linkedin_profile_text: LINKEDIN.replace(/CloudKart Retail/g, "Other Co") });
    expect(r.linkedin.resume_roles_missing_on_linkedin.join(" ")).toMatch(/CloudKart/);
  });
});

describe("gap analysis", () => {
  const jd = analyzeJobDescription(JD);
  const g = analyzeGaps(jd, { resume_text: RESUME, linkedin_text: LINKEDIN }, JD);

  it("assigns sensible strategies", () => {
    const by = Object.fromEntries(g.gaps.map((x) => [x.skill, x]));
    expect(by["PostgreSQL"].strategy).toBe("surface"); // on LinkedIn
    expect(by["Go"].learning).toBe(true); // "currently learning Go"
    expect(by["Apache Kafka"].strategy).toBe("reframe"); // has RabbitMQ
    expect(by["Apache Kafka"].related_skills_you_have).toContain("RabbitMQ");
    expect(by["gRPC"].strategy).toBe("bridge_project");
  });

  it("proposes domain-themed bridge projects that close must-have gaps", () => {
    expect(g.bridge_projects.length).toBeGreaterThan(0);
    const p = g.bridge_projects[0];
    expect(p.name.toLowerCase()).toContain("payments");
    expect(p.closes_gaps).toEqual(expect.arrayContaining(["Apache Kafka", "Go"]));
    expect(p.build_plan.length).toBeGreaterThanOrEqual(3);
  });

  it("maps focus points to real evidence, not skill lists", () => {
    const ci = g.evidence_map.find((e) => /CI\/CD/.test(e.focus_point))!;
    expect(ci.best_matching_lines[0].line).toMatch(/Jenkins pipelines/);
    for (const e of g.evidence_map) for (const l of e.best_matching_lines) expect(l.line).not.toMatch(/learning/i);
  });
});

describe("bridge projects", () => {
  it("themes projects by domain and prefers concrete tech in the stack", () => {
    const p = suggestBridgeProjects({
      gaps: [{ skill: "Retrieval-Augmented Generation", weight: 5 }, { skill: "Vector Databases", weight: 4 }, { skill: "LLM Evaluation", weight: 3 }],
      candidate_skills: ["Python", "FastAPI"],
      jd_text: "We build AI tools for hospitals and clinical teams to improve patient care.",
      max_projects: 1,
    });
    expect(p[0].archetype).toBe("llm_rag");
    expect(p[0].name).toMatch(/Healthcare/);
  });
});

describe("scoring", () => {
  it("scores the tailored resume far above the original", () => {
    const before = scoreResume({ resume_text: RESUME }, JD);
    const after = scoreResume({ resume: TAILORED }, JD, { original_resume_text: RESUME, linkedin_text: LINKEDIN });
    expect(after.total).toBeGreaterThanOrEqual(85);
    expect(after.total - before.total).toBeGreaterThanOrEqual(25);
    expect(after.truth_check?.unverified_claims).toEqual([]);
  });

  it("catches claims with no evidence", () => {
    const r = structuredClone(TAILORED);
    r.skills[0].items.push("Rust");
    r.experience[0].bullets.push({ text: "Built a Rust matching engine handling 1M orders/sec", source: "reframed" });
    const s = scoreResume({ resume: r }, JD, { original_resume_text: RESUME, linkedin_text: LINKEDIN });
    expect(s.truth_check!.unverified_claims.some((c) => c.skills_not_in_sources.includes("Rust"))).toBe(true);
  });

  it("blocks unfilled placeholders", () => {
    const r = structuredClone(TAILORED);
    r.experience[0].bullets[0] = "Reduced latency by [N]% using caching";
    const s = scoreResume({ resume: r }, JD);
    expect(s.blockers.join(" ")).toMatch(/placeholder/i);
  });
});
