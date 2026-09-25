import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { analyzeGaps } from "../src/core/gap.js";
import { analyzeJobDescription } from "../src/core/jd.js";
import { buildApplicationKit } from "../src/core/kit.js";
import { findHiddenExperience, parseRoles, yearsWithSkill } from "../src/core/roles.js";
import { detectLanguage, scaffoldProject } from "../src/core/scaffold.js";
import { translateTitles } from "../src/core/titles.js";
import { Resume } from "../src/schemas.js";
import { createServer } from "../src/server.js";

const ex = (f: string) => readFileSync(fileURLToPath(new URL(`../examples/${f}`, import.meta.url)), "utf8");
const JD = ex("sample-jd.txt");
const RESUME = ex("sample-resume.txt");
const LINKEDIN = ex("sample-linkedin.txt");
const TAILORED = Resume.parse(JSON.parse(ex("sample-tailored-resume.json")));
const NOW = new Date(2026, 8, 25);
const CANDIDATE = {
  full_name: "Priya Raman",
  email: "priya.raman.dev@example.com",
  phone: "+91 98450 12345",
  location: "Bengaluru, India",
  linkedin_url: "linkedin.com/in/priya-raman-dev",
  resume_text: RESUME,
  linkedin_text: LINKEDIN,
};

describe("roles and years per skill", () => {
  it("parses title, company and dates for each role", () => {
    const roles = parseRoles(RESUME, NOW).filter((r) => r.section === "experience");
    expect(roles.map((r) => [r.title, r.company])).toEqual([
      ["Software Engineer II", "Finverse Technologies"],
      ["Software Engineer", "CloudKart Retail"],
    ]);
  });

  it("computes honest years with each skill from dated roles, rounded down", () => {
    const y = Object.fromEntries(yearsWithSkill(RESUME, ["Java", "Redis", "Go"], NOW).map((s) => [s.skill, s]));
    expect(y.Java.years).toBe(7);
    expect(y.Redis.years).toBe(4.5);
    expect(y.Go.years).toBe(0);
    expect(y.Go.label).toMatch(/No professional use/);
  });
});

describe("title translation", () => {
  const role = (title: string, text: string) => ({ title, company: "Acme", start: NOW, end: NOW, current: true, dates: "", section: "experience" as const, text });

  it("maps internal titles to market titles and keeps the official one", () => {
    const t = translateTitles([role("Member of Technical Staff", "Built Java microservices and REST APIs")], "Software Engineer");
    expect(t[0].suggested).toBe("Software Engineer (Member of Technical Staff)");
  });

  it("only rewrites IT-services titles when the work was software", () => {
    expect(translateTitles([role("Systems Engineer", "Developed Spring Boot APIs in Java")], null)[0]?.suggested).toBe("Software Engineer (Systems Engineer)");
    expect(translateTitles([role("Systems Engineer", "Managed data center hardware and cabling")], null)).toEqual([]);
  });

  it("adds the JD's specialty when the work matches it", () => {
    const t = translateTitles([role("Software Engineer II", "Designed REST APIs and microservices")], "Senior Backend Engineer");
    expect(t[0].suggested).toBe("Software Engineer II (Backend)");
  });
});

describe("resume boosts in analyze_gaps", () => {
  const jd = analyzeJobDescription(JD);
  const g = analyzeGaps(jd, { resume_text: RESUME, linkedin_text: LINKEDIN, additional_context: "Won 2nd place at a college hackathon building a Slack bot (2018). Contributed to the open-source Spring Batch project (2 merged PRs)." }, JD);

  it("finds buried experience worth promoting", () => {
    expect(g.resume_plan.experience_promotions.map((p) => p.kind)).toEqual(expect.arrayContaining(["hackathon", "open_source"]));
    expect(findHiddenExperience({ resume_text: RESUME })).toEqual([]);
  });

  it("drafts a Skills section: Languages first, JD phrasing, and a Familiar tier for learning-only skills", () => {
    const s = g.resume_plan.skills_section_draft;
    expect(s[0].category).toBe("Languages");
    expect(s.find((l) => l.category === "Familiar with")?.items).toEqual(expect.arrayContaining(["Go", "Kubernetes"]));
    expect(s.flatMap((l) => l.items)).not.toContain("Apache Kafka");
    expect(s.flatMap((l) => l.items)).not.toContain("Slack");
  });

  it("suggests certifications that each close different gaps", () => {
    const certs = g.quick_win_certifications;
    expect(certs.length).toBeGreaterThan(0);
    const closed = certs.flatMap((c) => c.closes);
    expect(new Set(closed).size).toBe(closed.length);
    expect(certs[0].list_on_resume_as).toMatch(/\(In Progress, expected [A-Z][a-z]{2} \d{4}\)/);
  });
});

describe("application kit", () => {
  const kit = buildApplicationKit({ jd_text: JD, job_url: "https://boards.greenhouse.io/ledgerly/jobs/1", posted: "2 days ago", candidate: CANDIDATE, resume: TAILORED, now: NOW });
  const everything = JSON.stringify(kit);

  it("never claims experience the candidate doesn't have", () => {
    // Go and Kafka only exist in an in-progress bridge project.
    for (const text of [kit.cover_letter, kit.outreach.referral_request, kit.interview_prep.elevator_pitch, kit.linkedin_optimization.headline]) {
      expect(text).not.toMatch(/experience[^.]*\b(Go|Apache Kafka)\b/);
      expect(text).not.toMatch(/mostly in [^.]*\b(Go|Apache Kafka)\b/);
    }
    expect(kit.interview_prep.likely_questions.map((q) => q.question)).not.toContain("How have you used Go in production? What trade-offs did you make?");
    expect(kit.knockout_check.find((k) => k.check === "Must-have skills")!.advice).toMatch(/Go.*Apache Kafka/);
  });

  it("attributes evidence to the right employer and leads with the strongest result", () => {
    expect(kit.cover_letter).toMatch(/At Finverse Technologies, I re-architected loan disbursement settlement/);
    expect(kit.cover_letter).not.toMatch(/At Finverse Technologies, I built Jenkins/);
  });

  it("detects the portal and posting age", () => {
    expect(kit.job.ats).toBe("Greenhouse");
    expect(kit.job.posted_days_ago).toBe(2);
    expect(kit.apply_today_checklist[0]).toMatch(/apply today/);
  });

  it("answers form questions honestly, with the basis for each number", () => {
    const java = kit.form_answers.find((f) => f.question === "Years of experience with Java")!;
    expect(java.answer).toBe("7");
    expect(java.note).toMatch(/Finverse.*CloudKart/);
    const go = kit.form_answers.find((f) => f.question === "Years of experience with Go")!;
    expect(go.answer).toMatch(/No professional use/);
    expect(kit.form_answers.find((f) => /sponsorship/.test(f.question))!.answer).toMatch(/\[Yes \/ No/);
  });

  it("produces outreach that fits LinkedIn limits and links to people search", () => {
    expect(kit.outreach.linkedin_connection_note.length).toBeLessThanOrEqual(200);
    expect(kit.outreach.find_people.map((p) => p.purpose).join(" ")).toMatch(/PES University alumni/);
    expect(kit.outreach.follow_up_email.send_on).toBe("2026-10-02");
    expect(everything).not.toMatch(/undefined|NaN/);
  });

  it("flags a sponsorship knockout when the JD won't sponsor and the candidate needs it", () => {
    const k = buildApplicationKit({
      jd_text: JD.replace("Benefits", "We are unable to sponsor visas for this role. Candidates must be authorized to work in the US.\n\nBenefits"),
      candidate: { ...CANDIDATE, needs_sponsorship: true },
      now: NOW,
    });
    expect(k.knockout_check.find((x) => x.check.startsWith("Work authorization"))?.status).toBe("risk");
  });
});

describe("bridge project scaffolding", () => {
  it("picks the language from the stack and adds local dependencies", () => {
    expect(detectLanguage(["Apache Kafka", "Go", "gRPC"])).toBe("go");
    expect(detectLanguage(["FastAPI", "Vector Databases"])).toBe("python");
    expect(detectLanguage(["React", "TypeScript"])).toBe("typescript");
    const r = scaffoldProject({ name: "Event-Driven Payments Pipeline", stack: ["Go", "Apache Kafka", "PostgreSQL"], build_plan: ["Day 1: x"], jd_text: JD, github_username: "someone" });
    expect(r.repo_name).toBe("event-driven-payments-pipeline");
    expect(Object.keys(r.files)).toEqual(expect.arrayContaining(["go.mod", "cmd/server/main.go", "internal/api/router_test.go", ".github/workflows/ci.yml", "docker-compose.yml", "README.md", "BUILD_LOG.md"]));
    expect(r.files["docker-compose.yml"]).toMatch(/kafka:[\s\S]*postgres:|postgres:[\s\S]*kafka:/);
    expect(r.files["internal/api/router.go"]).toMatch(/\/api\/v1\/transactions/);
    expect(r.files["README.md"]).toMatch(/- \[ \] Day 1: x/);
  });

  it("generates Python that at least compiles", () => {
    const r = scaffoldProject({ name: "RAG Copilot", stack: ["Python", "FastAPI"] });
    const dir = mkdtempSync(join(tmpdir(), "rf-py-"));
    for (const [p, body] of Object.entries(r.files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), body);
    }
    expect(() => execFileSync("python3", ["-m", "py_compile", join(dir, "app/main.py"), join(dir, "tests/test_health.py")])).not.toThrow();
  });
});

describe("MCP tools (v0.2)", () => {
  async function connect(writeFiles: boolean) {
    const server = createServer({ writeFiles });
    const client = new Client({ name: "t", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }

  it("build_application_kit saves the pack and cover letter, and logs the application", async () => {
    const client = await connect(true);
    const dir = mkdtempSync(join(tmpdir(), "rf-kit-"));
    const res = (await client.callTool({
      name: "build_application_kit",
      arguments: { jd_text: JD, job_url: "https://jobs.lever.co/ledgerly/1", candidate: CANDIDATE, resume: TAILORED, output_dir: dir, log_application: true },
    })) as { content: { text: string }[] };
    const meta = JSON.parse(res.content[0].text);
    expect(existsSync(meta.files.pack)).toBe(true);
    expect(existsSync(meta.files.cover)).toBe(true);
    expect(readFileSync(meta.files.tracker, "utf8")).toMatch(/^company,role,[\s\S]*Ledgerly,/);
    expect(meta.job.ats).toBe("Lever");
    expect(res.content[1].text).toMatch(/# Application Pack: Senior Backend Engineer/);
  });

  it("scaffold_bridge_project writes a repo and refuses to overwrite it", async () => {
    const client = await connect(true);
    const dir = mkdtempSync(join(tmpdir(), "rf-scaffold-"));
    const args = { project: { name: "Payments Pipeline", stack: ["TypeScript", "Redis"] }, output_dir: dir };
    const first = (await client.callTool({ name: "scaffold_bridge_project", arguments: args })) as { content: { text: string }[]; isError?: boolean };
    expect(first.isError).toBeFalsy();
    expect(readdirSync(join(dir, "payments-pipeline"))).toEqual(expect.arrayContaining(["package.json", "src", "test", "README.md", "docker-compose.yml"]));
    const second = (await client.callTool({ name: "scaffold_bridge_project", arguments: args })) as { isError?: boolean };
    expect(second.isError).toBe(true);
  });

  it("returns scaffold files inline in remote mode", async () => {
    const client = await connect(false);
    const res = (await client.callTool({ name: "scaffold_bridge_project", arguments: { project: { name: "X Service", stack: ["Go"] } } })) as { content: { text: string }[] };
    expect(Object.keys(JSON.parse(res.content[0].text).files)).toContain("go.mod");
  });
});
