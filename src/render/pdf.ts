import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { bulletText, type Resume } from "../schemas.js";
import type { PageSize } from "./pageSize.js";
import { certLabel, contactLine, contactParts, displayUrl, projectLabel, sectionOrder, skillsTitle } from "../core/resumeText.js";

/**
 * Standard PDF fonts only cover WinAnsi. Set RESUMEFORGE_FONT_REGULAR / _BOLD
 * to TTF paths for full Unicode (non-Latin names, etc.).
 */
const CUSTOM_REGULAR = process.env.RESUMEFORGE_FONT_REGULAR;
const CUSTOM_BOLD = process.env.RESUMEFORGE_FONT_BOLD;
const useCustom = !!(CUSTOM_REGULAR && CUSTOM_BOLD && existsSync(CUSTOM_REGULAR) && existsSync(CUSTOM_BOLD));

function clean(s: string): string {
  if (useCustom) return s;
  return s
    .replace(/[→⇒➜➔]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[µ]/g, "u")
    .replace(/[•●▪]/g, "-")
    .replace(/[^\x00-\xFF–—‘’“”…€]/g, "");
}

interface Scale {
  body: number;
  gap: number;
}

const SCALES: Scale[] = [
  { body: 10.5, gap: 1 },
  { body: 10, gap: 0.85 },
  { body: 9.6, gap: 0.7 },
  { body: 9.2, gap: 0.55 },
];

function build(r: Resume, sc: Scale, pageSize: PageSize): { doc: PDFKit.PDFDocument; pages: number; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: pageSize === "a4" ? "A4" : "LETTER", margins: { top: 36, bottom: 36, left: 40, right: 40 }, bufferPages: true, info: { Title: `${r.basics.name} Resume`, Author: r.basics.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  if (useCustom) {
    doc.registerFont("R", CUSTOM_REGULAR!);
    doc.registerFont("B", CUSTOM_BOLD!);
  }
  const R = useCustom ? "R" : "Helvetica";
  const B = useCustom ? "B" : "Helvetica-Bold";
  const I = useCustom ? "R" : "Helvetica-Oblique";
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const S = sc.body;

  const heading = (t: string) => {
    doc.moveDown(0.55 * sc.gap);
    doc.font(B).fontSize(S + 1).fillColor("#000").text(clean(t.toUpperCase()), left, doc.y, { characterSpacing: 0.5 });
    const y = doc.y + 1;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor("#333").stroke();
    doc.moveDown(0.3 * sc.gap);
  };

  const row = (l: { t: string; bold?: boolean; italic?: boolean }[], right: string) => {
    const y = doc.y;
    doc.font(R).fontSize(S);
    const rw = right ? doc.widthOfString(clean(right)) + 4 : 0;
    doc.text("", left, y);
    l.forEach((part, i) => {
      doc.font(part.bold ? B : part.italic ? I : R).fontSize(S);
      doc.text(clean(part.t), { continued: i < l.length - 1, width: width - rw, lineBreak: true });
    });
    const endY = doc.y;
    if (right) doc.font(R).fontSize(S).text(clean(right), left, y, { width, align: "right" });
    doc.y = Math.max(endY, doc.y);
    doc.x = left;
  };

  const bullets = (items: string[]) => {
    if (!items.length) return;
    doc.font(R).fontSize(S);
    for (const it of items) {
      const y = doc.y;
      doc.circle(left + 5, y + S * 0.45, 1.2).fill("#000");
      doc.text(clean(it), left + 12, y, { width: width - 12, lineGap: 0.5 });
      doc.moveDown(0.12 * sc.gap);
    }
    doc.x = left;
  };

  const b = r.basics;
  doc.font(B).fontSize(S + 8).text(clean(b.name), left, doc.y, { width, align: "center" });
  if (b.headline) doc.font(R).fontSize(S + 1).text(clean(b.headline), { width, align: "center" });
  // Never let a URL wrap mid-handle: split contact info over two lines if needed.
  doc.font(R).fontSize(S - 0.8);
  const one = clean(contactLine(r));
  if (doc.widthOfString(one) <= width) doc.text(one, { width, align: "center" });
  else {
    const { plain, links } = contactParts(r);
    doc.text(clean(plain.join(" | ")), { width, align: "center" });
    doc.text(clean(links.join(" | ")), { width, align: "center" });
  }

  for (const key of sectionOrder(r)) {
    if (key === "summary" && r.summary) {
      heading("Summary");
      doc.font(R).fontSize(S).text(clean(r.summary), left, doc.y, { width, lineGap: 0.5 });
    }
    if (key === "skills" && r.skills.length) {
      heading(skillsTitle(r));
      for (const s of r.skills) {
        doc.font(B).fontSize(S).text(clean(`${s.category}: `), left, doc.y, { continued: true, width });
        doc.font(R).text(clean(s.items.join(", ")), { width });
      }
    }
    if (key === "experience" && r.experience.length) {
      heading("Experience");
      for (const e of r.experience) {
        const dates = `${e.start} – ${e.end}`;
        doc.fontSize(S);
        const full = doc.font(B).widthOfString(clean(e.title)) + doc.font(R).widthOfString(clean(` | ${e.company}, ${e.location ?? ""}`));
        const fits = !e.location || full + doc.widthOfString(dates) + 12 <= width;
        row([{ t: e.title, bold: true }, { t: ` | ${e.company}${e.location && fits ? `, ${e.location}` : ""}` }], dates);
        if (e.location && !fits) doc.font(I).fontSize(S - 0.8).text(clean(e.location), left, doc.y, { width });
        bullets(e.bullets.map(bulletText));
        doc.moveDown(0.25 * sc.gap);
      }
    }
    if (key === "projects" && r.projects.length) {
      heading("Projects");
      for (const p of r.projects) {
        const parts: { t: string; bold?: boolean; italic?: boolean }[] = [{ t: p.name + projectLabel(p), bold: true }];
        if (p.tech.length) parts.push({ t: ` | ${p.tech.join(", ")}`, italic: true });
        row(parts, p.date ?? "");
        if (p.link) doc.font(R).fontSize(S - 0.8).fillColor("#1a4fa0").text(clean(displayUrl(p.link)), left, doc.y, { width, link: /^https?:/.test(p.link) ? p.link : `https://${p.link}` }).fillColor("#000");
        bullets(p.bullets.map(bulletText));
        doc.moveDown(0.25 * sc.gap);
      }
    }
    if (key === "education" && r.education.length) {
      heading("Education");
      for (const e of r.education) {
        row([{ t: e.degree, bold: true }, { t: ` | ${e.institution}${e.location ? `, ${e.location}` : ""}${e.gpa ? ` | GPA: ${e.gpa}` : ""}` }], [e.start, e.end].filter(Boolean).join(" – "));
        bullets(e.details);
      }
    }
    if (key === "certifications" && r.certifications.length) {
      heading("Certifications");
      bullets(r.certifications.map((c) => `${c.name}${certLabel(c)}${c.issuer ? ` | ${c.issuer}` : ""}${c.date ? ` | ${c.date}` : ""}`));
    }
    if (key === "extras") {
      for (const x of r.extras) {
        heading(x.heading);
        bullets(x.items);
      }
    }
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  return { doc, pages, done };
}

/** Render, tightening typography until the resume fits in `maxPages`. */
export async function renderPdf(r: Resume, maxPages = 1, pageSize: PageSize = "letter"): Promise<{ buffer: Buffer; pages: number; fitted: boolean }> {
  let last: { buffer: Buffer; pages: number } | null = null;
  for (const sc of SCALES) {
    const { pages, done } = build(r, sc, pageSize);
    const buffer = await done;
    last = { buffer, pages };
    if (pages <= maxPages) return { ...last, fitted: true };
  }
  return { ...last!, fitted: false };
}
