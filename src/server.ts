import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { suggestBridgeProjects } from "./core/bridge.js";
import { analyzeGaps } from "./core/gap.js";
import { normalizeLinkedIn, validateIntake } from "./core/intake.js";
import { analyzeJobDescription } from "./core/jd.js";
import { resumeToText } from "./core/resumeText.js";
import { scoreResume } from "./core/score.js";
import { findSkills } from "./core/skills.js";
import { buildApplicationKit } from "./core/kit.js";
import { scaffoldProject } from "./core/scaffold.js";
import { defaultOutputDir, fileStem, renderAll, resumeToMarkdown, type Format } from "./render/index.js";
import { kitToMarkdown, logApplication, renderCoverLetterDocx, writeKitFiles } from "./render/kit.js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CandidateProfile, Resume } from "./schemas.js";
import { ATS_RULES, INTAKE_CHECKLIST, WORKFLOW } from "./workflow.js";

export const VERSION = "0.2.0";

export interface ServerOptions {
  /** Write rendered files to disk (local stdio use). Remote servers return files inline instead. */
  writeFiles: boolean;
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string, extra: Record<string, unknown> = {}) => ({
  isError: true,
  content: [{ type: "text" as const, text: JSON.stringify({ error: message, ...extra }, null, 2) }],
});

const jdInput = {
  jd_text: z.string().min(80).describe("Full job description text, including requirements and responsibilities"),
  job_title: z.string().optional().describe("Exact job title, if known (improves title matching)"),
  company: z.string().optional().describe("Company name, if known"),
};

const CandidateSourcesSchema = z
  .object({
    original_resume_text: z.string().optional(),
    linkedin_text: z.string().optional(),
    additional_context: z.string().optional(),
    confirmed_skills: z.array(z.string()).optional().describe("Skills the candidate explicitly confirmed having used"),
  })
  .optional()
  .describe("The candidate's original materials. Enables truth_check, which flags claims with no evidence.");

function linkedinAlignment(resume: Resume, jdTitle: string | null, linkedinText?: string) {
  const skills = resume.skills.flatMap((s) => s.items);
  const top = skills.slice(0, 3).map((s) => s.replace(/\s*\(.*\)$/, ""));
  const liSkills = linkedinText ? new Set(findSkills(linkedinText).keys()) : null;
  const missingOnLi = liSkills ? [...new Set(skills.flatMap((i) => [...findSkills(i).keys()]))].filter((s) => !liSkills.has(s)) : [];
  return {
    suggested_headline: `${jdTitle ?? resume.basics.headline ?? "Software Engineer"} | ${top.join(" · ")}`.slice(0, 220),
    about_opener: resume.summary?.split(/(?<=\.)\s/)[0] ?? null,
    skills_to_add_on_linkedin: liSkills ? missingOnLi.slice(0, 20) : skills.slice(0, 20),
    reminder: "Recruiters open LinkedIn right after the resume. Make sure the titles, companies and dates match exactly. Add bridge projects under Projects once they're public.",
  };
}

export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer(
    { name: "resumeforge", version: VERSION },
    {
      instructions:
        "ResumeForge tailors resumes to job descriptions for ATS and human reviewers. ALWAYS call start_resume_session first and follow the playbook it returns. " +
        "Never generate a resume before validate_intake returns ready=true (the candidate's details, current resume and LinkedIn are required).",
    },
  );

  // ── 1. Session start ──────────────────────────────────────────────────────
  server.registerTool(
    "start_resume_session",
    {
      title: "Start resume session",
      description:
        "Call this FIRST whenever a user wants a resume built, tailored or checked against a job. Returns the step-by-step playbook, the intake checklist (what to collect from the candidate, including the LinkedIn profile), and ATS formatting rules.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      json({
        playbook: WORKFLOW,
        intake_checklist: INTAKE_CHECKLIST,
        ats_rules: ATS_RULES,
        first_message_to_candidate:
          "To build your resume for this role, I need: (1) your full name, email, phone and location; (2) your LinkedIn profile URL, plus the profile text (paste it, or use LinkedIn → More → Save to PDF); (3) your current resume (paste the full text); (4) the job description; and optionally (5) your GitHub/portfolio and anything that's not on your resume yet (side projects, courses, tools you've used).",
      }),
  );

  // ── 2. Intake gate ────────────────────────────────────────────────────────
  server.registerTool(
    "validate_intake",
    {
      title: "Validate candidate intake",
      description:
        "Validates that all primary candidate details are collected (name, email, phone, location, LinkedIn URL, current resume) and cross-checks the resume against the LinkedIn profile text. Returns ready=true only when resume generation may proceed.",
      inputSchema: CandidateProfile.partial().shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => json(validateIntake(args)),
  );

  // ── 3. JD analysis ────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_job_description",
    {
      title: "Analyze job description",
      description:
        "Decodes a job description into weighted keywords (must-have vs nice-to-have, with exact ATS phrasing), ranked focus points, seniority, years required, education/certifications, domain terms, action verbs to mirror, and implied expectations.",
      inputSchema: jdInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ jd_text, job_title, company }) => json(analyzeJobDescription(jd_text, { title: job_title, company })),
  );

  // ── 4. Gap analysis ───────────────────────────────────────────────────────
  server.registerTool(
    "analyze_gaps",
    {
      title: "Analyze candidate vs JD gaps",
      description:
        "Compares the candidate (resume, LinkedIn, extra context) to the JD. For every missing requirement, assigns a strategy (surface, reframe, ask_candidate, bridge_project, quick_learn). Also maps each JD focus point to the candidate's best existing evidence, proposes JD-themed bridge projects, suggests quick-win certifications, and returns a resume plan: headline, section order, summary formula, a drop-in Skills section with a 'Familiar with' tier, job-title translations (e.g. 'Member of Technical Staff' → 'Software Engineer (MTS)'), and buried experience worth promoting (internships, freelance, open source). Also returns questions to ask the candidate.",
      inputSchema: {
        ...jdInput,
        resume_text: z.string().describe("Candidate's current resume text"),
        linkedin_text: z.string().optional(),
        additional_context: z.string().optional(),
        career_stage: CandidateProfile.shape.career_stage,
        years_of_experience: z.number().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ jd_text, job_title, company, ...candidate }) => {
      const jd = analyzeJobDescription(jd_text, { title: job_title, company });
      const gaps = analyzeGaps(jd, candidate, jd_text);
      return json({
        jd_summary: { title: jd.title, company: jd.company, seniority: jd.seniority, role_family: jd.role_family, must_have: jd.must_have, top_focus_points: jd.focus_points.slice(0, 5).map((f) => f.statement) },
        ...gaps,
      });
    },
  );

  // ── 5. Bridge projects ────────────────────────────────────────────────────
  server.registerTool(
    "suggest_bridge_projects",
    {
      title: "Suggest bridge projects",
      description:
        "Designs realistic, company-themed portfolio projects that close specific skill gaps in days. Each comes with a stack, a day-by-day build plan, resume bullet templates (fill with real measured numbers), and interview talking points. Use it for more or different project ideas than analyze_gaps returned.",
      inputSchema: {
        jd_text: z.string().min(80),
        missing_skills: z.array(z.string()).optional().describe("Skills to close. Defaults to the JD's must-haves missing from candidate_skills."),
        candidate_skills: z.array(z.string()).default([]).describe("Skills the candidate already has"),
        company: z.string().optional(),
        max_projects: z.number().int().min(1).max(5).default(3),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ jd_text, missing_skills, candidate_skills, company, max_projects }) => {
      const jd = analyzeJobDescription(jd_text, { company });
      const have = new Set(candidate_skills.flatMap((s) => [...findSkills(s).keys(), s]));
      const wanted = missing_skills?.length
        ? missing_skills.map((s) => {
            const canon = findSkills(s).keys().next().value ?? s;
            return { skill: canon, weight: jd.keywords.find((k) => k.skill === canon)?.weight ?? 3 };
          })
        : jd.keywords.filter((k) => !have.has(k.skill) && k.category !== "soft_skill").map((k) => ({ skill: k.skill, weight: k.weight }));
      const projects = suggestBridgeProjects({ gaps: wanted, candidate_skills: [...have], jd_text, company: company ?? jd.company, max_projects });
      return json({
        projects,
        make_it_unique:
          "Tailor each project to this company: use their public product domain, their API or public data if available, and name the project after the problem it solves for their users. Pin the repo on GitHub with a README (problem, architecture diagram, results with numbers, how to run).",
      });
    },
  );

  // ── 6. Scoring ────────────────────────────────────────────────────────────
  server.registerTool(
    "score_resume",
    {
      title: "Score resume against JD (ATS simulation)",
      description:
        "Scores a resume 0–100 against a JD the way keyword-ranking ATS and recruiters do: weighted keyword match, keywords backed by bullets, title alignment, bullet quality (verbs, metrics), structure/parseability, length, and integrity (placeholders, stuffing). Pass candidate_sources to get a truth_check of unverified claims. Accepts a structured resume or plain text.",
      inputSchema: {
        ...jdInput,
        resume: Resume.optional().describe("Structured resume (preferred)"),
        resume_text: z.string().optional().describe("Or plain resume text, e.g. to score the ORIGINAL resume for a before/after comparison"),
        candidate_sources: CandidateSourcesSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ jd_text, job_title, company, resume, resume_text, candidate_sources }) => {
      if (!resume && !resume_text) return fail("Provide either resume (structured) or resume_text.");
      const jd = analyzeJobDescription(jd_text, { title: job_title, company });
      return json(scoreResume({ resume, resume_text }, jd_text, candidate_sources, jd));
    },
  );

  // ── 7. Render ─────────────────────────────────────────────────────────────
  server.registerTool(
    "render_resume",
    {
      title: "Render final resume files",
      description:
        "Renders the approved resume to ATS-safe DOCX / PDF / Markdown / TXT. Requires candidate_approved=true and a valid LinkedIn URL. Refuses if placeholder metrics like [N] remain. Also returns LinkedIn alignment suggestions and, if jd_text is given, the final ATS score.",
      inputSchema: {
        resume: Resume,
        candidate_approved: z.boolean().describe("true only after the candidate reviewed and approved the final content"),
        formats: z.array(z.enum(["docx", "pdf", "md", "txt"])).default(["docx", "pdf"]),
        max_pages: z.number().int().min(1).max(3).default(1),
        output_dir: z.string().optional().describe("Local mode only. Defaults to ~/ResumeForge or $RESUMEFORGE_OUTPUT_DIR"),
        company: z.string().optional().describe("Used in the file name"),
        role: z.string().optional().describe("Used in the file name"),
        jd_text: z.string().optional().describe("If provided, includes the final ATS score"),
        candidate_sources: CandidateSourcesSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ resume, candidate_approved, formats, max_pages, output_dir, company, role, jd_text, candidate_sources }) => {
      if (!candidate_approved) {
        return fail("Show the final resume to the candidate and get explicit approval first, then call again with candidate_approved=true.", {
          preview_markdown: resumeToMarkdown(resume),
        });
      }
      const li = normalizeLinkedIn(resume.basics.linkedin);
      if (!li) return fail(`basics.linkedin "${resume.basics.linkedin}" is not a valid LinkedIn profile URL (https://www.linkedin.com/in/<handle>).`);
      resume.basics.linkedin = li.replace(/^https:\/\/www\./, "");
      const text = resumeToText(resume);
      const placeholders = text.match(/\[(N|X|Y|metric|insight|link|project|fix\/feature|issue|number)\]/gi);
      if (placeholders) {
        return fail(`Unfilled placeholders remain: ${[...new Set(placeholders)].join(", ")}. Replace them with the candidate's real numbers, or reword the bullet without a number.`);
      }

      const files = await renderAll(resume, formats as Format[], { outputDir: output_dir, write: opts.writeFiles, company, role, maxPages: max_pages });
      const jd = jd_text ? analyzeJobDescription(jd_text, { title: role, company }) : null;
      const score = jd_text ? scoreResume({ resume }, jd_text, candidate_sources, jd!) : undefined;
      const summary = {
        files: files.map((f) => ({ format: f.format, path: f.path ?? "(returned inline below)", bytes: f.buffer.length, note: f.note })),
        final_ats_score: score ? { total: score.total, grade: score.grade, verdict: score.verdict, remaining_fixes: score.top_fixes.slice(0, 3) } : "Pass jd_text to include the final score.",
        in_progress_items: [
          ...resume.projects.filter((p) => p.status === "in_progress").map((p) => `Project: ${p.name}`),
          ...resume.certifications.filter((c) => c.status === "in_progress").map((c) => `Certification: ${c.name}`),
        ],
        linkedin_alignment: linkedinAlignment(resume, jd?.title ?? role ?? null, candidate_sources?.linkedin_text),
        next_steps: [
          "Call build_application_kit with the same JD, the candidate's details and this resume. It produces form answers, a cover letter, referral messages, LinkedIn updates and interview prep.",
          "Upload the DOCX to Workday, iCIMS or Taleo portals. The PDF is fine for Greenhouse, Lever and Ashby.",
          "Finish every in-progress item before the interview (scaffold_bridge_project creates a starter repo).",
        ],
      };
      const content: ({ type: "text"; text: string } | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } })[] = [
        { type: "text", text: JSON.stringify(summary, null, 2) },
        { type: "text", text: resumeToMarkdown(resume) },
      ];
      if (!opts.writeFiles) {
        for (const f of files.filter((x) => x.format === "docx" || x.format === "pdf")) {
          content.push({ type: "resource", resource: { uri: `resumeforge://files/resume.${f.format}`, mimeType: f.mime, blob: f.buffer.toString("base64") } });
        }
      }
      return { content };
    },
  );

  // ── 8. Application kit ────────────────────────────────────────────────────
  server.registerTool(
    "build_application_kit",
    {
      title: "Build the application kit",
      description:
        "Everything needed to actually apply, generated from the JD and the candidate's materials: an apply-today checklist with portal-specific tips (Workday, Greenhouse, Lever…), an auto-reject check (years, degree, sponsorship, location, must-haves), copy-paste answers to application form questions (including honest 'years with X' computed from role dates), a cover letter, referral and recruiter messages with LinkedIn search links, a LinkedIn connection note, follow-up and thank-you emails, LinkedIn headline/About/skills updates, interview prep (elevator pitch, likely questions, 'defend every bullet'), and a tracker entry. Call it after render_resume, passing the final resume.",
      inputSchema: {
        ...jdInput,
        job_url: z.string().optional().describe("Posting URL. Used to detect the application portal and tailor tips."),
        posted: z.string().optional().describe("When it was posted, e.g. '3 days ago' or '2026-09-20'"),
        candidate: z.object({
          full_name: z.string(),
          email: z.string(),
          phone: z.string().optional(),
          location: z.string().optional(),
          linkedin_url: z.string(),
          github_url: z.string().optional(),
          portfolio_url: z.string().optional(),
          resume_text: z.string().describe("The candidate's ORIGINAL resume text"),
          linkedin_text: z.string().optional(),
          additional_context: z.string().optional(),
          work_authorization: z.string().optional(),
          needs_sponsorship: z.boolean().optional(),
          willing_to_relocate: z.boolean().optional(),
          notice_period: z.string().optional(),
          salary_expectation: z.string().optional(),
          referral_contact: z.string().optional().describe("Name of an employee who referred them, if any"),
        }),
        resume: Resume.optional().describe("The final tailored resume (strongly recommended)"),
        save_files: z.boolean().default(true).describe("Local mode: save Application_Pack.md and Cover_Letter.docx next to the resume"),
        log_application: z.boolean().default(false).describe("Append to applications.csv. Set true only after the candidate confirms they submitted."),
        output_dir: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ jd_text, job_title, company, job_url, posted, candidate, resume, save_files, log_application, output_dir }) => {
      const kit = buildApplicationKit({ jd_text, job_title, company, job_url, posted, candidate, resume });
      const markdown = kitToMarkdown(kit);
      const saved: Record<string, string> = {};
      if (opts.writeFiles && save_files) {
        const stem = resume ? fileStem(resume, kit.job.company, kit.job.title.split(",")[0]) : candidate.full_name.replace(/\W+/g, "_");
        Object.assign(saved, await writeKitFiles(kit, stem, output_dir));
      }
      if (opts.writeFiles && log_application) saved.tracker = await logApplication(kit, output_dir);
      const meta = {
        job: kit.job,
        files: Object.keys(saved).length ? saved : opts.writeFiles ? "not saved (save_files=false)" : "returned inline below",
        knockout_summary: kit.knockout_check.map((k) => `${k.status.toUpperCase()}: ${k.check}. ${k.advice}`),
        placeholders_to_fill: [...new Set(markdown.match(/\[[A-Z][^\]]{2,80}\]/g) ?? [])].slice(0, 12),
        polish_instructions: kit.polish_instructions,
        present_to_candidate:
          "Show the apply-today checklist first, then the knockout check, then ask for anything in placeholders_to_fill. Hand over the rest of the pack as a file or in sections, not as one wall of text.",
      };
      const content: ({ type: "text"; text: string } | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } })[] = [
        { type: "text", text: JSON.stringify(meta, null, 2) },
        { type: "text", text: markdown },
      ];
      if (!opts.writeFiles) {
        const docx = await renderCoverLetterDocx(kit.cover_letter);
        content.push({ type: "resource", resource: { uri: "resumeforge://files/cover-letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", blob: docx.toString("base64") } });
      }
      return { content };
    },
  );

  // ── 9. Bridge project starter repo ────────────────────────────────────────
  server.registerTool(
    "scaffold_bridge_project",
    {
      title: "Scaffold a bridge project repo",
      description:
        "Generates a runnable starter repository for a bridge project: a Go, Python (FastAPI) or TypeScript service with a /health endpoint and a passing test, CI, a docker-compose for the stack's databases and brokers, a README carrying the build plan, results table and resume-bullet templates, and a BUILD_LOG. Java gets a Spring Initializr command. Pass a project from analyze_gaps or suggest_bridge_projects.",
      inputSchema: {
        project: z.object({
          name: z.string(),
          pitch: z.string().optional(),
          stack: z.array(z.string()).optional(),
          closes_gaps: z.array(z.string()).optional(),
          build_plan: z.array(z.string()).optional(),
          resume_bullets_template: z.array(z.string()).optional(),
          interview_talking_points: z.array(z.string()).optional(),
        }),
        language: z.enum(["go", "python", "typescript", "java"]).optional().describe("Defaults to the stack's main language"),
        jd_text: z.string().optional().describe("Used to name routes after the company's domain"),
        github_username: z.string().optional(),
        output_dir: z.string().optional().describe("Local mode: parent folder. Defaults to ~/ResumeForge/projects"),
        overwrite: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ project, language, jd_text, github_username, output_dir, overwrite }) => {
      const result = scaffoldProject({ ...project, language, jd_text, github_username });
      if (!opts.writeFiles) {
        return json({ ...result, how_to_use: "Create each file at its path (relative to a new folder named repo_name), then follow next_steps." });
      }
      const root = resolve(output_dir ?? join(defaultOutputDir(), "projects"), result.repo_name);
      if (existsSync(root) && !overwrite) {
        return fail(`${root} already exists. Pass overwrite=true to replace the scaffold files, or choose another output_dir.`);
      }
      for (const [rel, body] of Object.entries(result.files)) {
        const file = join(root, rel);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
      }
      return json({
        created: root,
        language: result.language,
        files: Object.keys(result.files),
        next_steps: [`cd "${root}"`, ...result.next_steps.slice(1)],
      });
    },
  );

  // ── Prompts & resources (for hosts that support them) ────────────────────
  server.registerPrompt(
    "tailor_resume",
    {
      title: "Tailor my resume to a job",
      description: "Guided flow: collect your details and LinkedIn, decode the JD, close gaps, and produce an ATS-optimized resume.",
      argsSchema: { job_description: z.string().optional() },
    },
    ({ job_description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${WORKFLOW}\n\nStart now. First call start_resume_session, then collect my details.${job_description ? `\n\nHere is the job description:\n${job_description}` : ""}`,
          },
        },
      ],
    }),
  );

  server.registerResource("playbook", "resumeforge://guide/playbook", { title: "ResumeForge playbook", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: WORKFLOW }],
  }));
  server.registerResource("ats-rules", "resumeforge://guide/ats-rules", { title: "ATS formatting rules", mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: ATS_RULES }],
  }));

  return server;
}
