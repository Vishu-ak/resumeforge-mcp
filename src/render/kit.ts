import { Document, Packer, Paragraph, TextRun } from "docx";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ApplicationKit } from "../core/kit.js";
import { defaultOutputDir } from "./index.js";

const STATUS_ICON = { ok: "✅", risk: "⚠️", unknown: "❓" } as const;

export function kitToMarkdown(k: ApplicationKit): string {
  const o: string[] = [];
  o.push(`# Application Pack: ${k.job.title} at ${k.job.company}`, "");
  if (k.job.url) o.push(`Job link: ${k.job.url}  `);
  o.push(`Application portal: **${k.job.ats}**${k.job.posted_days_ago !== null ? ` · posted ${k.job.posted_days_ago} day(s) ago` : ""}`, "");

  o.push("## 1. Do this today", ...k.apply_today_checklist.map((s, i) => `${i + 1}. ${s}`), "");
  if (k.ats_tips.length) o.push(`**${k.job.ats} tips**`, ...k.ats_tips.map((t) => `- ${t}`), "");

  o.push("## 2. Auto-reject check", "| Check | Job says | You | Status | What to do |", "|---|---|---|---|---|");
  for (const x of k.knockout_check) o.push(`| ${x.check} | ${x.jd_says.replace(/\|/g, "/")} | ${x.you} | ${STATUS_ICON[x.status]} | ${x.advice} |`);
  o.push("");

  o.push("## 3. Application form answers (copy and paste)", "");
  for (const f of k.form_answers) {
    o.push(`**${f.question}**`, "", f.answer, ...(f.note ? ["", `> ${f.note}`] : []), "");
  }

  o.push("## 4. Cover letter", "", "```text", k.cover_letter, "```", "");

  o.push("## 5. Referrals and outreach", "", "**Find people to contact**", ...k.outreach.find_people.map((p) => `- [${p.purpose}](${p.url})`), "");
  o.push("**Referral request (LinkedIn message)**", "", "```text", k.outreach.referral_request, "```", "");
  o.push(`**LinkedIn connection note** (${k.outreach.linkedin_connection_note.length} chars)`, "", "```text", k.outreach.linkedin_connection_note, "```", "");
  o.push(`**Recruiter email**: subject: *${k.outreach.recruiter_email.subject}*`, "", "```text", k.outreach.recruiter_email.body, "```", "");
  o.push(`**Follow-up email** (send on ${k.outreach.follow_up_email.send_on}): subject: *${k.outreach.follow_up_email.subject}*`, "", "```text", k.outreach.follow_up_email.body, "```", "");
  o.push(`**Thank-you email** (same day as each interview): subject: *${k.outreach.thank_you_email.subject}*`, "", "```text", k.outreach.thank_you_email.body, "```", "");

  const L = k.linkedin_optimization;
  o.push("## 6. LinkedIn updates", "", `**Headline:** ${L.headline}`, "", "**About:**", "", "```text", L.about, "```", "");
  o.push(`**Skills to add:** ${L.skills_to_add.join(", ")}`, "", `**Open to Work titles:** ${L.open_to_work_titles.join(", ")}`, "", ...L.featured.map((f) => `- ${f}`), "");

  const I = k.interview_prep;
  o.push("## 7. Interview prep", "", "**Elevator pitch (\"Tell me about yourself\")**", "", `> ${I.elevator_pitch}`, "", "**Likely questions**", "");
  for (const q of I.likely_questions) o.push(`- **${q.question}**  \n  _Why:_ ${q.why_they_ask} _Prep:_ ${q.prep_hint}`);
  o.push("", "**Defend every bullet**", "");
  for (const b of I.bullet_defense) o.push(`- ${b.bullet}`, ...b.be_ready_for.map((q) => `  - ${q}`));
  o.push("", "**Questions to ask them**", ...I.questions_to_ask_them.map((q) => `- ${q}`), "");

  const t = k.tracker_entry;
  o.push("## 8. Tracker", "", "| Company | Role | Status | Applied | Follow up | Second follow-up |", "|---|---|---|---|---|---|", `| ${t.company} | ${t.role} | ${t.status} | ${t.applied_on} | ${t.follow_up_on} | ${t.second_follow_up_on} |`, "");
  return o.join("\n");
}

export async function renderCoverLetterDocx(text: string): Promise<Buffer> {
  const paragraphs = text.split("\n").map(
    (line) => new Paragraph({ spacing: { after: line.trim() ? 120 : 0 }, children: [new TextRun({ text: line, font: "Calibri", size: 22 })] }),
  );
  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Append the application to a CSV tracker (creates it with a header on first use). */
export async function logApplication(k: ApplicationKit, outputDir?: string): Promise<string> {
  const dir = outputDir ? resolve(outputDir) : defaultOutputDir();
  await mkdir(dir, { recursive: true });
  const file = join(dir, "applications.csv");
  const exists = await stat(file).then(() => true, () => false);
  const t = { ...k.tracker_entry, status: "Applied" };
  const header = "company,role,job_url,status,applied_on,follow_up_on,second_follow_up_on\n";
  const row = [t.company, t.role, t.job_url, t.status, t.applied_on, t.follow_up_on, t.second_follow_up_on].map(csvCell).join(",") + "\n";
  await appendFile(file, (exists ? "" : header) + row);
  return file;
}

export async function writeKitFiles(k: ApplicationKit, stem: string, outputDir?: string): Promise<{ pack: string; cover: string }> {
  const dir = outputDir ? resolve(outputDir) : defaultOutputDir();
  await mkdir(dir, { recursive: true });
  const pack = join(dir, `${stem}_Application_Pack.md`);
  const cover = join(dir, `${stem}_Cover_Letter.docx`);
  await writeFile(pack, kitToMarkdown(k));
  await writeFile(cover, await renderCoverLetterDocx(k.cover_letter));
  return { pack, cover };
}
