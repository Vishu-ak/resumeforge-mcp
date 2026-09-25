import { z } from "zod";

/**
 * Where a resume line came from. This is how the connector keeps resumes
 * aggressive but defensible: every claim traces back to something the
 * candidate actually said, did, or has committed to building.
 */
export const EvidenceSource = z.enum([
  "original_resume", // stated in the uploaded resume
  "linkedin", // stated on the LinkedIn profile
  "candidate_confirmed", // candidate confirmed it in chat
  "reframed", // true experience, rewritten in the JD's language
  "bridge_project", // a project the candidate is building/has built to close a gap
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Bullet = z.union([
  z.string().min(1),
  z.object({
    text: z.string().min(1),
    source: EvidenceSource.optional(),
  }),
]);
export type Bullet = z.infer<typeof Bullet>;

export const bulletText = (b: Bullet): string => (typeof b === "string" ? b : b.text);
export const bulletSource = (b: Bullet): EvidenceSource | undefined =>
  typeof b === "string" ? undefined : b.source;

export const CandidateProfile = z.object({
  full_name: z.string().describe("Candidate's full name as it should appear on the resume"),
  email: z.string().describe("Professional email address"),
  phone: z.string().describe("Phone number with country code, e.g. +1 415 555 0100"),
  location: z.string().describe("City, State/Region, Country — or 'Remote'"),
  linkedin_url: z.string().describe("Public LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe"),
  linkedin_profile_text: z
    .string()
    .optional()
    .describe(
      "Text of the LinkedIn profile (About, Experience, Skills, Education). Paste it, or use LinkedIn 'More → Save to PDF' and paste the text.",
    ),
  current_resume_text: z.string().describe("Full text of the candidate's current resume (any format, pasted as text)"),
  target_role: z.string().optional().describe("Role title the candidate is applying for"),
  github_url: z.string().optional(),
  portfolio_url: z.string().optional(),
  years_of_experience: z.number().min(0).max(60).optional(),
  work_authorization: z.string().optional().describe("e.g. 'US Citizen', 'H-1B transfer', 'Requires sponsorship'"),
  willing_to_relocate: z.boolean().optional(),
  career_stage: z
    .enum(["student", "new_grad", "early_career", "mid_career", "senior", "career_switcher", "returning"])
    .optional(),
  additional_context: z
    .string()
    .optional()
    .describe("Anything not in the resume: side projects, courses, hackathons, open source, things they can learn quickly"),
});
export type CandidateProfile = z.infer<typeof CandidateProfile>;

export const Resume = z.object({
  basics: z.object({
    name: z.string(),
    headline: z.string().optional().describe("Target title line under the name, mirroring the JD title"),
    email: z.string(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string(),
    github: z.string().optional(),
    portfolio: z.string().optional(),
  }),
  summary: z.string().optional(),
  skills: z
    .array(z.object({ category: z.string(), items: z.array(z.string()).min(1) }))
    .default([]),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        location: z.string().optional(),
        start: z.string().describe("e.g. 'Jan 2022' or '2022-01'"),
        end: z.string().describe("e.g. 'Present' or 'Mar 2024'"),
        bullets: z.array(Bullet).default([]),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        link: z.string().optional(),
        tech: z.array(z.string()).default([]),
        status: z.enum(["completed", "in_progress"]).default("completed"),
        date: z.string().optional(),
        bullets: z.array(Bullet).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string(),
        institution: z.string(),
        location: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        gpa: z.string().optional(),
        details: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        date: z.string().optional(),
        status: z.enum(["earned", "in_progress"]).default("earned"),
      }),
    )
    .default([]),
  extras: z
    .array(z.object({ heading: z.string(), items: z.array(z.string()).min(1) }))
    .default([])
    .describe("Additional sections: Awards, Publications, Leadership, Volunteering, Languages"),
  section_order: z
    .array(z.enum(["summary", "skills", "experience", "projects", "education", "certifications", "extras"]))
    .optional()
    .describe("Override section order. Default is chosen from career stage."),
});
export type Resume = z.infer<typeof Resume>;
export type ResumeInput = z.input<typeof Resume>;
