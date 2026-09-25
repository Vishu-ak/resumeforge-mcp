import { bulletText, type Resume } from "../schemas.js";

export type SectionKey = NonNullable<Resume["section_order"]>[number];

export const DEFAULT_ORDER: SectionKey[] = ["summary", "skills", "experience", "projects", "education", "certifications", "extras"];

export const SECTION_TITLES: Record<SectionKey, string> = {
  summary: "Summary",
  skills: "Technical Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  extras: "",
};

export function sectionOrder(r: Resume): SectionKey[] {
  const order = r.section_order?.length ? r.section_order : DEFAULT_ORDER;
  return [...order, ...DEFAULT_ORDER.filter((s) => !order.includes(s))];
}

export function skillsTitle(r: Resume): string {
  const cats = r.skills.map((s) => s.category.toLowerCase()).join(" ");
  // Non-technical resumes get the neutral heading.
  return /language|framework|cloud|database|devops|tool|stack|backend|frontend|ml|data/.test(cats) ? "Technical Skills" : "Skills";
}

export const projectLabel = (p: Resume["projects"][number]) => (p.status === "in_progress" ? " (In Progress)" : "");
export const certLabel = (c: Resume["certifications"][number]) => (c.status === "in_progress" ? " (In Progress)" : "");

export const displayUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

export function contactParts(r: Resume): { plain: string[]; links: string[] } {
  const b = r.basics;
  return {
    plain: [b.location, b.phone, b.email].filter((x): x is string => !!x),
    links: [b.linkedin, b.github, b.portfolio].filter((x): x is string => !!x).map(displayUrl),
  };
}

export function contactLine(r: Resume): string {
  const { plain, links } = contactParts(r);
  return [...plain, ...links].join(" | ");
}

/** Plain-text rendering — also exactly what an ATS "sees" after parsing. */
export function resumeToText(r: Resume): string {
  const out: string[] = [r.basics.name];
  if (r.basics.headline) out.push(r.basics.headline);
  out.push(contactLine(r), "");

  for (const key of sectionOrder(r)) {
    switch (key) {
      case "summary":
        if (r.summary) out.push("SUMMARY", r.summary, "");
        break;
      case "skills":
        if (r.skills.length) {
          out.push(skillsTitle(r).toUpperCase());
          r.skills.forEach((s) => out.push(`${s.category}: ${s.items.join(", ")}`));
          out.push("");
        }
        break;
      case "experience":
        if (r.experience.length) {
          out.push("EXPERIENCE");
          for (const e of r.experience) {
            out.push(`${e.title} | ${e.company}${e.location ? ` | ${e.location}` : ""} | ${e.start} - ${e.end}`);
            e.bullets.forEach((b) => out.push(`- ${bulletText(b)}`));
            out.push("");
          }
        }
        break;
      case "projects":
        if (r.projects.length) {
          out.push("PROJECTS");
          for (const p of r.projects) {
            const meta = [p.tech.length ? p.tech.join(", ") : "", p.link ?? "", p.date ?? ""].filter(Boolean).join(" | ");
            out.push(`${p.name}${projectLabel(p)}${meta ? ` | ${meta}` : ""}`);
            p.bullets.forEach((b) => out.push(`- ${bulletText(b)}`));
            out.push("");
          }
        }
        break;
      case "education":
        if (r.education.length) {
          out.push("EDUCATION");
          for (const e of r.education) {
            const dates = [e.start, e.end].filter(Boolean).join(" - ");
            out.push(`${e.degree} | ${e.institution}${e.location ? ` | ${e.location}` : ""}${dates ? ` | ${dates}` : ""}${e.gpa ? ` | GPA: ${e.gpa}` : ""}`);
            e.details.forEach((d) => out.push(`- ${d}`));
          }
          out.push("");
        }
        break;
      case "certifications":
        if (r.certifications.length) {
          out.push("CERTIFICATIONS");
          r.certifications.forEach((c) => out.push(`- ${c.name}${certLabel(c)}${c.issuer ? ` | ${c.issuer}` : ""}${c.date ? ` | ${c.date}` : ""}`));
          out.push("");
        }
        break;
      case "extras":
        for (const x of r.extras) {
          out.push(x.heading.toUpperCase());
          x.items.forEach((i) => out.push(`- ${i}`));
          out.push("");
        }
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function allBullets(r: Resume) {
  return [
    ...r.experience.flatMap((e) => e.bullets.map((b) => ({ where: `${e.title} @ ${e.company}`, bullet: b, kind: "experience" as const }))),
    ...r.projects.flatMap((p) => p.bullets.map((b) => ({ where: p.name, bullet: b, kind: "project" as const, status: p.status }))),
  ];
}
