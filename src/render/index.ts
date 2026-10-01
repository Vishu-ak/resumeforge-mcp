import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { bulletText, type Resume } from "../schemas.js";
import { certLabel, contactLine, projectLabel, resumeToText, sectionOrder, skillsTitle } from "../core/resumeText.js";
import { renderDocx } from "./docx.js";
import { renderPdf } from "./pdf.js";
import type { PageSize } from "./pageSize.js";

export type Format = "docx" | "pdf" | "md" | "txt";

export function resumeToMarkdown(r: Resume): string {
  const b = r.basics;
  const out: string[] = [`# ${b.name}`];
  if (b.headline) out.push(`**${b.headline}**`);
  out.push(contactLine(r), "");
  for (const key of sectionOrder(r)) {
    if (key === "summary" && r.summary) out.push("## Summary", r.summary, "");
    if (key === "skills" && r.skills.length) {
      out.push(`## ${skillsTitle(r)}`, ...r.skills.map((s) => `- **${s.category}:** ${s.items.join(", ")}`), "");
    }
    if (key === "experience" && r.experience.length) {
      out.push("## Experience");
      for (const e of r.experience) {
        out.push(`### ${e.title} | ${e.company}${e.location ? ` | ${e.location}` : ""}`, `*${e.start} – ${e.end}*`, ...e.bullets.map((x) => `- ${bulletText(x)}`), "");
      }
    }
    if (key === "projects" && r.projects.length) {
      out.push("## Projects");
      for (const p of r.projects) {
        out.push(`### ${p.name}${projectLabel(p)}${p.tech.length ? ` | *${p.tech.join(", ")}*` : ""}`);
        if (p.link || p.date) out.push([p.link, p.date].filter(Boolean).join(" | "));
        out.push(...p.bullets.map((x) => `- ${bulletText(x)}`), "");
      }
    }
    if (key === "education" && r.education.length) {
      out.push("## Education");
      for (const e of r.education) {
        const dates = [e.start, e.end].filter(Boolean).join(" – ");
        out.push(`**${e.degree}** | ${e.institution}${e.location ? `, ${e.location}` : ""}${dates ? ` | ${dates}` : ""}${e.gpa ? ` | GPA: ${e.gpa}` : ""}`);
        out.push(...e.details.map((d) => `- ${d}`), "");
      }
    }
    if (key === "certifications" && r.certifications.length) {
      out.push("## Certifications", ...r.certifications.map((c) => `- ${c.name}${certLabel(c)}${c.issuer ? ` | ${c.issuer}` : ""}${c.date ? ` | ${c.date}` : ""}`), "");
    }
    if (key === "extras") for (const x of r.extras) out.push(`## ${x.heading}`, ...x.items.map((i) => `- ${i}`), "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function defaultOutputDir(): string {
  return process.env.RESUMEFORGE_OUTPUT_DIR ? resolve(process.env.RESUMEFORGE_OUTPUT_DIR) : join(homedir(), "ResumeForge");
}

export function fileStem(r: Resume, company?: string, role?: string): string {
  const safe = (s?: string) => (s ?? "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return [safe(r.basics.name), safe(company), safe(role), "Resume"].filter(Boolean).join("_");
}

export interface RenderedFile {
  format: Format;
  path?: string;
  buffer: Buffer;
  mime: string;
  note?: string;
}

const MIME: Record<Format, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
};

export async function renderAll(
  r: Resume,
  formats: Format[],
  opts: { outputDir?: string; write: boolean; company?: string; role?: string; maxPages?: number; pageSize?: PageSize },
): Promise<RenderedFile[]> {
  const stem = fileStem(r, opts.company, opts.role);
  const dir = opts.outputDir ? resolve(opts.outputDir) : defaultOutputDir();
  if (opts.write) await mkdir(dir, { recursive: true });
  const files: RenderedFile[] = [];
  for (const f of formats) {
    let buffer: Buffer;
    let note: string | undefined;
    if (f === "docx") buffer = await renderDocx(r, opts.pageSize);
    else if (f === "pdf") {
      const res = await renderPdf(r, opts.maxPages ?? 1, opts.pageSize);
      buffer = res.buffer;
      note = res.fitted ? `${res.pages} page(s)` : `Runs to ${res.pages} pages at the smallest readable size. Cut the weakest bullets to fit ${opts.maxPages ?? 1}.`;
    } else if (f === "md") buffer = Buffer.from(resumeToMarkdown(r), "utf8");
    else buffer = Buffer.from(resumeToText(r), "utf8");
    const file: RenderedFile = { format: f, buffer, mime: MIME[f], note };
    if (opts.write) {
      file.path = join(dir, `${stem}.${f}`);
      await writeFile(file.path, buffer);
    }
    files.push(file);
  }
  return files;
}
