/**
 * Certifications a motivated candidate can realistically earn in days to a few
 * weeks. Prep hours are rough estimates for someone with adjacent experience;
 * always check the issuer's site for the current exam, price and format.
 */
export interface QuickCert {
  name: string;
  issuer: string;
  /** Canonical skill names (src/data/skills.ts) this cert signals. */
  skills: string[];
  prep_hours: [number, number];
  level: "foundational" | "associate";
}

export const QUICK_CERTS: QuickCert[] = [
  { name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", skills: ["AWS", "Cloud Architecture"], prep_hours: [10, 20], level: "foundational" },
  { name: "AWS Certified AI Practitioner", issuer: "Amazon Web Services", skills: ["Generative AI", "Machine Learning", "Large Language Models", "AWS"], prep_hours: [10, 20], level: "foundational" },
  { name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", skills: ["AWS", "AWS Lambda", "DynamoDB", "Serverless", "CI/CD"], prep_hours: [40, 60], level: "associate" },
  { name: "AWS Certified Solutions Architect – Associate", issuer: "Amazon Web Services", skills: ["AWS", "Cloud Architecture", "Scalability", "Networking"], prep_hours: [40, 80], level: "associate" },
  { name: "Microsoft Azure Fundamentals (AZ-900)", issuer: "Microsoft", skills: ["Microsoft Azure", "Cloud Architecture"], prep_hours: [8, 15], level: "foundational" },
  { name: "Microsoft Azure AI Fundamentals (AI-900)", issuer: "Microsoft", skills: ["Artificial Intelligence", "Machine Learning", "Microsoft Azure"], prep_hours: [8, 15], level: "foundational" },
  { name: "Microsoft Power BI Data Analyst (PL-300)", issuer: "Microsoft", skills: ["Power BI", "Data Visualization", "Data Analysis"], prep_hours: [30, 50], level: "associate" },
  { name: "Google Cloud Digital Leader", issuer: "Google Cloud", skills: ["Google Cloud Platform", "Cloud Architecture"], prep_hours: [10, 15], level: "foundational" },
  { name: "Google Associate Cloud Engineer", issuer: "Google Cloud", skills: ["Google Cloud Platform", "Kubernetes", "Google Kubernetes Engine"], prep_hours: [40, 60], level: "associate" },
  { name: "Kubernetes and Cloud Native Associate (KCNA)", issuer: "The Linux Foundation / CNCF", skills: ["Kubernetes", "Docker", "Cloud Architecture", "Observability"], prep_hours: [15, 25], level: "foundational" },
  { name: "Certified Kubernetes Application Developer (CKAD)", issuer: "The Linux Foundation / CNCF", skills: ["Kubernetes", "Docker"], prep_hours: [30, 50], level: "associate" },
  { name: "HashiCorp Certified: Terraform Associate", issuer: "HashiCorp", skills: ["Terraform", "Infrastructure as Code"], prep_hours: [15, 25], level: "associate" },
  { name: "GitHub Actions Certification", issuer: "GitHub", skills: ["GitHub Actions", "CI/CD"], prep_hours: [10, 15], level: "associate" },
  { name: "GitHub Foundations", issuer: "GitHub", skills: ["Git", "Code Review", "Open Source"], prep_hours: [5, 10], level: "foundational" },
  { name: "MongoDB Associate Developer", issuer: "MongoDB", skills: ["MongoDB", "NoSQL"], prep_hours: [15, 25], level: "associate" },
  { name: "SnowPro Core Certification", issuer: "Snowflake", skills: ["Snowflake", "Data Warehousing", "SQL"], prep_hours: [25, 40], level: "associate" },
  { name: "Databricks Certified Data Engineer Associate", issuer: "Databricks", skills: ["Databricks", "Apache Spark", "ETL", "Data Warehousing"], prep_hours: [25, 40], level: "associate" },
  { name: "Tableau Desktop Specialist", issuer: "Tableau (Salesforce)", skills: ["Tableau", "Data Visualization"], prep_hours: [15, 25], level: "foundational" },
  { name: "Oracle Certified Professional: Java SE Developer", issuer: "Oracle", skills: ["Java", "Object-Oriented Programming"], prep_hours: [40, 60], level: "associate" },
  { name: "CompTIA Security+", issuer: "CompTIA", skills: ["Cybersecurity", "Application Security", "Encryption", "Identity and Access Management"], prep_hours: [40, 80], level: "associate" },
  { name: "Professional Scrum Master I (PSM I)", issuer: "Scrum.org", skills: ["Scrum", "Agile"], prep_hours: [10, 15], level: "foundational" },
  { name: "Certified Associate in Project Management (CAPM)", issuer: "PMI", skills: ["Project Management", "Stakeholder Management"], prep_hours: [30, 50], level: "foundational" },
  { name: "Salesforce Certified Administrator", issuer: "Salesforce", skills: ["Salesforce", "CRM"], prep_hours: [40, 60], level: "associate" },
  { name: "Google Ads Search Certification", issuer: "Google", skills: ["Digital Marketing", "Marketing Analytics"], prep_hours: [5, 10], level: "foundational" },
  { name: "HubSpot Inbound Marketing Certification", issuer: "HubSpot Academy", skills: ["Content Marketing", "HubSpot", "Digital Marketing"], prep_hours: [5, 10], level: "foundational" },
];
