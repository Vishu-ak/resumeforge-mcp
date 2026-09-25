import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { renderAll } from "../src/render/index.js";
import { Resume } from "../src/schemas.js";
import { createServer } from "../src/server.js";

const ex = (f: string) => readFileSync(fileURLToPath(new URL(`../examples/${f}`, import.meta.url)), "utf8");
const JD = ex("sample-jd.txt");
const RESUME_JSON = JSON.parse(ex("sample-tailored-resume.json"));

async function connect(writeFiles: boolean) {
  const server = createServer({ writeFiles });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

type TextContent = { type: "text"; text: string };
const firstJson = (res: unknown) => JSON.parse(((res as { content: TextContent[] }).content[0]).text);

describe("MCP server", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect(true);
  });

  it("lists all tools, prompts and resources", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(
      expect.arrayContaining(["start_resume_session", "validate_intake", "analyze_job_description", "analyze_gaps", "suggest_bridge_projects", "score_resume", "render_resume"]),
    );
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toContain("tailor_resume");
    expect((await client.listResources()).resources.map((r) => r.uri)).toContain("resumeforge://guide/playbook");
  });

  it("start_resume_session returns the playbook and intake checklist", async () => {
    const out = firstJson(await client.callTool({ name: "start_resume_session", arguments: {} }));
    expect(out.playbook).toMatch(/Intake \(hard gate\)/);
    expect(out.intake_checklist.required.join(" ")).toMatch(/linkedin_url/);
  });

  it("validate_intake blocks when details are missing", async () => {
    const out = firstJson(await client.callTool({ name: "validate_intake", arguments: { full_name: "A B" } }));
    expect(out.ready).toBe(false);
    expect(out.missing_required).toEqual(expect.arrayContaining(["Email", "LinkedIn profile URL", "Current resume (paste the full text)"]));
  });

  it("analyze_gaps returns strategies, bridge projects and a plan", async () => {
    const out = firstJson(await client.callTool({ name: "analyze_gaps", arguments: { jd_text: JD, resume_text: ex("sample-resume.txt"), linkedin_text: ex("sample-linkedin.txt") } }));
    expect(out.jd_summary.company).toBe("Ledgerly");
    expect(out.gaps.length).toBeGreaterThan(0);
    expect(out.bridge_projects.length).toBeGreaterThan(0);
    expect(out.resume_plan.section_order[0]).toBe("summary");
  });

  it("render_resume refuses without candidate approval", async () => {
    const res = await client.callTool({ name: "render_resume", arguments: { resume: RESUME_JSON, candidate_approved: false } });
    expect(res.isError).toBe(true);
    expect(firstJson(res).preview_markdown).toMatch(/# Priya Raman/);
  });

  it("render_resume refuses invalid LinkedIn and unfilled placeholders", async () => {
    const badLi = await client.callTool({ name: "render_resume", arguments: { resume: { ...RESUME_JSON, basics: { ...RESUME_JSON.basics, linkedin: "linkedin.com/feed" } }, candidate_approved: true } });
    expect(badLi.isError).toBe(true);
    const r = structuredClone(RESUME_JSON);
    r.experience[0].bullets[0] = "Reduced latency by [N]%";
    const ph = await client.callTool({ name: "render_resume", arguments: { resume: r, candidate_approved: true } });
    expect(ph.isError).toBe(true);
    expect(firstJson(ph).error).toMatch(/placeholders/);
  });

  it("render_resume writes files locally and reports the final score", async () => {
    const dir = mkdtempSync(join(tmpdir(), "resumeforge-"));
    const res = await client.callTool({
      name: "render_resume",
      arguments: { resume: RESUME_JSON, candidate_approved: true, formats: ["docx", "pdf", "md"], output_dir: dir, company: "Ledgerly", role: "Senior Backend Engineer", jd_text: JD },
    });
    expect(res.isError).toBeFalsy();
    const out = firstJson(res);
    for (const f of out.files) expect(existsSync(f.path)).toBe(true);
    expect(out.final_ats_score.total).toBeGreaterThanOrEqual(85);
    expect(out.in_progress_items).toEqual(["Project: Event-Driven Payments Processing Pipeline"]);
    expect(out.linkedin_alignment.suggested_headline).toMatch(/Senior Backend Engineer/);
  });

  it("returns files inline in remote (HTTP) mode", async () => {
    const remote = await connect(false);
    const res = (await remote.callTool({ name: "render_resume", arguments: { resume: RESUME_JSON, candidate_approved: true, formats: ["pdf"] } })) as {
      content: { type: string; resource?: { mimeType: string; blob: string } }[];
    };
    const blob = res.content.find((c) => c.type === "resource")!.resource!;
    expect(blob.mimeType).toBe("application/pdf");
    expect(Buffer.from(blob.blob, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("renderers", () => {
  it("produce a valid DOCX zip, a one-page PDF and markdown with In Progress labels", async () => {
    const files = await renderAll(Resume.parse(RESUME_JSON), ["docx", "pdf", "md", "txt"], { write: false, maxPages: 1 });
    const by = Object.fromEntries(files.map((f) => [f.format, f]));
    expect(by.docx.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(by.pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(by.pdf.note).toBe("1 page(s)");
    expect(by.md.buffer.toString()).toMatch(/\(In Progress\)/);
    expect(by.txt.buffer.toString()).toMatch(/linkedin\.com\/in\/priya-raman-dev/);
  });

  it("shrinks typography to fit, and reports when it can't", async () => {
    const r = Resume.parse(RESUME_JSON);
    r.experience = Array.from({ length: 8 }, () => r.experience[0]);
    const files = await renderAll(r, ["pdf"], { write: false, maxPages: 1 });
    expect(files[0].note).toMatch(/Runs to \d pages/);
  });
});
