import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { bulletText, type Resume } from "../schemas.js";
import { certLabel, displayUrl, projectLabel, sectionOrder, skillsTitle } from "../core/resumeText.js";
import { DOCX_PAGE_DIMENSIONS, type PageSize } from "./pageSize.js";

const FONT = "Calibri";
const MARGIN = 720; // 0.5"

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 21, bold: o.bold, italics: o.italics });

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 1 } },
    children: [run(text.toUpperCase(), { bold: true, size: 22 })],
  });
}

function leftRight(left: TextRun[], right: string, rightTab: number) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
    spacing: { before: 80, after: 20 },
    children: [...left, run(`\t${right}`)],
  });
}

function bullet(text: string) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 20 },
    children: [run(text)],
  });
}

function link(url: string) {
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return new ExternalHyperlink({ link: href, children: [new TextRun({ text: displayUrl(url), font: FONT, size: 19, style: "Hyperlink" })] });
}

export async function renderDocx(r: Resume, pageSize: PageSize = "letter"): Promise<Buffer> {
  const b = r.basics;
  const page = DOCX_PAGE_DIMENSIONS[pageSize];
  const rightTab = page.width - MARGIN * 2;
  const children: Paragraph[] = [];

  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [run(b.name, { bold: true, size: 36 })] }));
  if (b.headline) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [run(b.headline, { size: 22 })] }));

  const plain = [b.location, b.phone, b.email].filter(Boolean) as string[];
  const links = [b.linkedin, b.github, b.portfolio].filter(Boolean) as string[];
  const contact: (TextRun | ExternalHyperlink)[] = [];
  plain.forEach((p, i) => contact.push(new TextRun({ text: (i ? " | " : "") + p, font: FONT, size: 19 })));
  links.forEach((l) => {
    contact.push(new TextRun({ text: " | ", font: FONT, size: 19 }));
    contact.push(link(l));
  });
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: contact }));

  for (const key of sectionOrder(r)) {
    if (key === "summary" && r.summary) {
      children.push(heading("Summary"), new Paragraph({ spacing: { after: 40 }, children: [run(r.summary)] }));
    }
    if (key === "skills" && r.skills.length) {
      children.push(heading(skillsTitle(r)));
      for (const s of r.skills) {
        children.push(new Paragraph({ spacing: { after: 20 }, children: [run(`${s.category}: `, { bold: true }), run(s.items.join(", "))] }));
      }
    }
    if (key === "experience" && r.experience.length) {
      children.push(heading("Experience"));
      for (const e of r.experience) {
        children.push(leftRight([run(e.title, { bold: true }), run(` | ${e.company}`)], `${e.start} – ${e.end}`, rightTab));
        if (e.location) children.push(new Paragraph({ spacing: { after: 20 }, children: [run(e.location, { italics: true, size: 19 })] }));
        e.bullets.forEach((x) => children.push(bullet(bulletText(x))));
      }
    }
    if (key === "projects" && r.projects.length) {
      children.push(heading("Projects"));
      for (const p of r.projects) {
        const left = [run(p.name + projectLabel(p), { bold: true })];
        if (p.tech.length) left.push(run(` | ${p.tech.join(", ")}`, { italics: true }));
        children.push(leftRight(left, p.date ?? "", rightTab));
        if (p.link) children.push(new Paragraph({ spacing: { after: 20 }, children: [link(p.link)] }));
        p.bullets.forEach((x) => children.push(bullet(bulletText(x))));
      }
    }
    if (key === "education" && r.education.length) {
      children.push(heading("Education"));
      for (const e of r.education) {
        const dates = [e.start, e.end].filter(Boolean).join(" – ");
        children.push(leftRight([run(e.degree, { bold: true }), run(` | ${e.institution}${e.location ? `, ${e.location}` : ""}`)], dates, rightTab));
        if (e.gpa) children.push(new Paragraph({ children: [run(`GPA: ${e.gpa}`)] }));
        e.details.forEach((d) => children.push(bullet(d)));
      }
    }
    if (key === "certifications" && r.certifications.length) {
      children.push(heading("Certifications"));
      r.certifications.forEach((c) =>
        children.push(bullet(`${c.name}${certLabel(c)}${c.issuer ? ` | ${c.issuer}` : ""}${c.date ? ` | ${c.date}` : ""}`)),
      );
    }
    if (key === "extras") {
      for (const x of r.extras) {
        children.push(heading(x.heading));
        x.items.forEach((i) => children.push(bullet(i)));
      }
    }
  }

  const doc = new Document({
    creator: b.name,
    title: `${b.name} Resume`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { size: page, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
  });
  return Packer.toBuffer(doc);
}
