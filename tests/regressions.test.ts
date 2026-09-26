import { describe, expect, it } from "vitest";
import { pickTheme } from "../src/core/bridge.js";
import { analyzeGaps } from "../src/core/gap.js";
import { analyzeJobDescription } from "../src/core/jd.js";
import { translateTitles } from "../src/core/titles.js";

// Found by running ResumeForge on a real Go backend posting.
const JD = `Software Engineer
Skills & Requirements
- Solid, hands-on Go development experience.
- Practical knowledge of microservices and event driven design patterns.
- Comfortable with reading and writing SQL, navigating Postgres DBs.
Qualifications and Requirements:
- Bachelor's or master's degree and 4+ years of industry experience, or 6-8 years of industry experience.
Requirements added by the job poster
- 2+ years of work experience with Go (Programming Language)
Featured benefits
Medical insurance, Vision insurance, Dental insurance, 401(k)`;

const RESUME = `EXPERIENCE
Software Engineer | Acme | Oct 2025 - Present
- Designed and built a procurement system in Python and PostgreSQL that replaced breaking spreadsheets.
Software Developer Intern (Capstone) | EduCo | Jan 2026 - May 2026
- Built an AI tutoring app in Django with a team of six, shipping 17 features.
SKILLS
Languages: Python, C++, SQL`;

describe("regressions from a real JD", () => {
  it("uses the general years requirement, not a skill-specific one", () => {
    const jd = analyzeJobDescription(JD);
    expect(jd.years_required).toBe(4);
    expect(jd.keywords.find((k) => k.skill === "Go")?.years).toBe(2);
  });

  it("does not treat C++ as a reframe path to Go", () => {
    const jd = analyzeJobDescription(JD);
    const go = analyzeGaps(jd, { resume_text: RESUME }, JD).gaps.find((g) => g.skill === "Go")!;
    expect(go.strategy).toBe("bridge_project");
  });

  it("ignores benefits when theming projects", () => {
    expect("match" in pickTheme(JD)).toBe(false);
    expect("match" in pickTheme(JD + "\nTravel:\nMay have to travel a few times a year for onsite team events.")).toBe(false);
    expect(pickTheme("We build booking software for hotels and airlines.").domain).toBe("travel");
    expect(pickTheme("Quick Wash Co — car wash memberships across 200 locations").domain).toBe("membership");
  });

  it("translates intern titles without nesting parentheses", () => {
    const t = translateTitles(
      [{ title: "Software Developer Intern (Capstone)", company: "EduCo", start: new Date(), end: new Date(), current: false, dates: "", section: "experience", text: "Built an AI tutoring app in Django" }],
      "Software Engineer",
    );
    expect(t[0].suggested).toBe("Software Engineer Intern (Capstone)");
  });

  it("doesn't pad the Skills section with loose business inferences", () => {
    const jd = analyzeJobDescription(JD);
    const items = analyzeGaps(jd, { resume_text: RESUME }, JD).resume_plan.skills_section_draft.flatMap((l) => l.items);
    expect(items).not.toContain("Supply Chain Management");
    expect(items).not.toContain("Microsoft Excel");
    expect(items).toEqual(expect.arrayContaining(["Python", "PostgreSQL (Postgres)"]));
  });
});
