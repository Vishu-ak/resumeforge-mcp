/**
 * Bridge-project archetypes. A bridge project closes a JD gap with real,
 * demonstrable work the candidate can build in days, themed to the target
 * company's domain so it reads as purpose-built for the role.
 *
 * Template tokens: {domain}, {entity}, {entities}, {event}, {user}, {company}
 */

export interface ProjectArchetype {
  id: string;
  /** Skills (canonical names) this archetype naturally exercises. */
  skills: string[];
  name: string;
  pitch: string;
  build_plan: string[];
  bullets: string[];
  stretch: string[];
  talking_points: string[];
  effort_hours: [number, number];
}

export const ARCHETYPES: ProjectArchetype[] = [
  {
    id: "backend_service",
    skills: ["REST APIs", "API Design", "Node.js", "Express.js", "NestJS", "Python", "FastAPI", "Django", "Flask", "Java", "Spring Boot", "Go", "C#", ".NET", "PostgreSQL", "MySQL", "Redis", "Caching", "Docker", "Unit Testing", "Integration Testing", "OpenAPI", "JWT", "OAuth 2.0", "ORM", "Database Design", "GraphQL", "TypeScript"],
    name: "{Domain} {Entity} Service API",
    pitch: "A production-style API for managing {entities} in a {domain} setting: auth, validation, pagination, caching, rate limiting and a documented OpenAPI contract.",
    build_plan: [
      "Day 1: Model the {entity} schema (with migrations) and scaffold the service; add health checks and structured logging.",
      "Day 2: CRUD and search endpoints, input validation, pagination, and consistent error handling. Generate OpenAPI docs.",
      "Day 3: JWT/OAuth auth plus role-based access. Add a Redis cache on hot reads, with invalidation.",
      "Day 4: Unit and integration tests (aim for 80%+ coverage). Dockerize it and write a docker-compose for the service, database and cache.",
      "Day 5: Load test with k6 and record p95 latency before and after caching. Write the README with an architecture diagram and the results.",
    ],
    bullets: [
      "Designed and built a {domain} {entity} API in {stack}, exposing [N] REST endpoints with OpenAPI documentation, JWT auth and role-based access control",
      "Cut p95 read latency from [X] ms to [Y] ms under [N] concurrent users by adding Redis caching and query indexing, verified with k6 load tests",
      "Reached [N]% test coverage with unit and integration tests running in CI; containerized with Docker Compose for one-command local setup",
    ],
    stretch: ["Idempotency keys for writes", "Rate limiting per API key", "Background jobs via a queue"],
    talking_points: ["Cache invalidation strategy and its trade-offs", "Index choices and EXPLAIN plans", "How you'd scale to 10x traffic"],
    effort_hours: [15, 25],
  },
  {
    id: "event_driven",
    skills: ["Apache Kafka", "RabbitMQ", "Amazon SQS", "Microservices", "Event-Driven Architecture", "Distributed Systems", "Docker", "Kubernetes", "Go", "Java", "Spring Boot", "Node.js", "Python", "Observability", "OpenTelemetry", "Scalability", "Concurrency", "gRPC"],
    name: "Event-Driven {Domain} Processing Pipeline",
    pitch: "Three microservices that talk over a message broker to process {event} events end-to-end, with retries, dead-letter queues, idempotency and distributed tracing.",
    build_plan: [
      "Day 1: Define the {event} event schemas and run the broker locally (docker-compose). Build the producer service.",
      "Day 2: Build two consumer services (e.g. validation and enrichment/notification) with idempotent handlers.",
      "Day 3: Add retries with backoff, a dead-letter queue, and ordering guarantees per {entity} key.",
      "Day 4: Wire up OpenTelemetry traces across services and a Grafana dashboard for throughput and lag.",
      "Day 5: Chaos-test it (kill a consumer mid-stream), measure recovery, and document the results in the README.",
    ],
    bullets: [
      "Architected an event-driven {domain} pipeline of [N] microservices ({stack}), processing [N]k {event} events/min with at-least-once delivery and idempotent consumers",
      "Built retry-with-backoff and dead-letter handling that brought message loss during consumer failures to zero, validated through chaos testing",
      "Instrumented services with OpenTelemetry distributed tracing and Grafana dashboards, cutting mean time-to-diagnose failures to under [N] minutes",
    ],
    stretch: ["Outbox pattern for transactional publishing", "Schema registry with versioning", "Deploy on Kubernetes with HPA"],
    talking_points: ["Exactly-once vs at-least-once", "Partitioning and ordering", "Back-pressure and consumer lag"],
    effort_hours: [20, 30],
  },
  {
    id: "cloud_iac",
    skills: ["AWS", "Microsoft Azure", "Google Cloud Platform", "Terraform", "Infrastructure as Code", "Kubernetes", "Docker", "CI/CD", "GitHub Actions", "AWS Lambda", "Amazon S3", "Amazon ECS", "Amazon EKS", "Amazon RDS", "Serverless", "Linux", "Networking", "Cloud Architecture", "Helm", "ArgoCD", "Identity and Access Management"],
    name: "{Domain} Platform on {Cloud}: IaC and Zero-Downtime Delivery",
    pitch: "The full infrastructure for a small {domain} app, reproducible from scratch with Terraform. It has a private network, a managed database, container hosting, secrets, and a CI/CD pipeline with blue-green deploys.",
    build_plan: [
      "Day 1: Terraform modules for the network (VPC/subnets), IAM roles with least privilege, and remote state.",
      "Day 2: Container hosting (ECS/EKS/Cloud Run/AKS) plus a managed Postgres, with secrets in a secrets manager.",
      "Day 3: GitHub Actions pipeline: lint, test, build image, scan, plan/apply infrastructure, deploy.",
      "Day 4: Blue-green or canary deploys with automated rollback on failed health checks. Alarms and dashboards.",
      "Day 5: Cost report and teardown/rebuild timing. README with an architecture diagram and a runbook.",
    ],
    bullets: [
      "Provisioned a production-style {domain} platform on {cloud} entirely with Terraform ([N] modules), rebuilding the environment from zero in [N] minutes",
      "Built a GitHub Actions CI/CD pipeline with image scanning and blue-green deploys, giving zero-downtime releases with automatic rollback on failed health checks",
      "Applied least-privilege IAM, private networking and managed secrets; documented a runbook and kept the monthly cost estimate at $[N]",
    ],
    stretch: ["Policy-as-code (OPA/Checkov)", "Multi-environment workspaces", "GitOps with ArgoCD"],
    talking_points: ["State management and drift", "Blast radius and IAM boundaries", "Rollback strategy"],
    effort_hours: [18, 30],
  },
  {
    id: "frontend_app",
    skills: ["React", "Next.js", "TypeScript", "JavaScript", "Vue.js", "Angular", "Svelte", "Redux", "React Query", "Tailwind CSS", "Web Accessibility", "Responsive Design", "Web Performance", "WebSockets", "Jest", "Playwright", "Cypress", "Storybook", "Design Systems", "HTML", "CSS", "GraphQL"],
    name: "Real-Time {Domain} Dashboard",
    pitch: "A fast, accessible web app where {users} manage {entities} in real time: optimistic updates, live sync over WebSockets, a component library, and a Lighthouse score of 95+.",
    build_plan: [
      "Day 1: Scaffold with TypeScript. Set up routing, auth screens, and a design-token-based component library in Storybook.",
      "Day 2: {Entity} list/detail views with server-state caching, optimistic updates, and loading/error states.",
      "Day 3: Real-time sync over WebSockets, with conflict handling and presence indicators.",
      "Day 4: Accessibility pass (keyboard navigation, ARIA, contrast) plus unit tests and Playwright E2E tests in CI.",
      "Day 5: Performance work: code-splitting, memoization, image optimization. Record Lighthouse and Core Web Vitals before and after.",
    ],
    bullets: [
      "Built a real-time {domain} dashboard in {stack} with WebSocket sync and optimistic UI, keeping [N] concurrent sessions consistent",
      "Raised the Lighthouse performance score from [X] to [Y] and cut LCP by [N]% through code-splitting, memoization and asset optimization",
      "Met WCAG 2.1 AA and shipped a reusable Storybook component library, covered by Jest unit tests and Playwright E2E tests in CI",
    ],
    stretch: ["Offline support (PWA)", "Internationalization", "Feature flags"],
    talking_points: ["State management choices", "Rendering strategies (SSR/CSR/ISR)", "How you measured performance"],
    effort_hours: [15, 25],
  },
  {
    id: "llm_rag",
    skills: ["Large Language Models", "Generative AI", "Retrieval-Augmented Generation", "Vector Databases", "Embeddings", "LangChain", "LlamaIndex", "OpenAI API", "Anthropic Claude API", "AI Agents", "Model Context Protocol", "Prompt Engineering", "LLM Evaluation", "Python", "FastAPI", "TypeScript", "Hugging Face", "Fine-tuning", "Natural Language Processing", "Pinecone"],
    name: "{Domain} Copilot: Grounded RAG Assistant with Evals",
    pitch: "An AI assistant that answers {domain} questions from a real document corpus with citations. It uses hybrid retrieval, tool-calling for live {entity} lookups, guardrails, and an evaluation harness that tracks accuracy, latency and cost.",
    build_plan: [
      "Day 1: Collect a public {domain} corpus. Build chunking and embedding into a vector store, then write a baseline retrieval notebook.",
      "Day 2: RAG API (FastAPI or Node) with citations, streaming responses, and a minimal chat UI.",
      "Day 3: Hybrid search (BM25 + vectors) with reranking. Add a tool/function call (or an MCP server) for live {entity} data.",
      "Day 4: Eval set of 50+ Q&A pairs. Measure faithfulness, answer accuracy, p95 latency and cost per query. Add guardrails.",
      "Day 5: Iterate on chunking and prompts using the evals, log the before/after numbers, and write the README with an architecture diagram.",
    ],
    bullets: [
      "Built a {domain} RAG assistant using {stack}, answering questions over [N] documents with source citations and streaming responses",
      "Raised answer accuracy from [X]% to [Y]% on a [N]-question eval set by adding hybrid retrieval, reranking and prompt iteration, at $[N] per 1k queries",
      "Added tool calling for live {entity} lookups plus guardrails against prompt injection and ungrounded answers, keeping p95 latency under [N] s",
    ],
    stretch: ["Agentic multi-step workflows", "Fine-tune a small model for classification", "Online feedback loop"],
    talking_points: ["Chunking and retrieval trade-offs", "How you evaluate LLM output", "Cost and latency controls"],
    effort_hours: [15, 28],
  },
  {
    id: "data_pipeline",
    skills: ["ETL", "Apache Airflow", "dbt", "Apache Spark", "SQL", "Python", "Pandas", "Snowflake", "BigQuery", "PostgreSQL", "Data Warehousing", "Data Analysis", "Data Visualization", "Tableau", "Power BI", "Looker", "Databricks", "Streaming Data", "Statistics", "Microsoft Excel"],
    name: "{Domain} Analytics Pipeline and KPI Dashboard",
    pitch: "An end-to-end pipeline that ingests public {domain} data, models it into a star schema with tests, orchestrates daily runs, and serves a KPI dashboard that answers real business questions.",
    build_plan: [
      "Day 1: Pick a public {domain} dataset or API. Write ingestion into raw tables (incremental, idempotent).",
      "Day 2: Model with dbt (staging → marts, star schema), with data-quality tests and documentation.",
      "Day 3: Orchestrate with Airflow (schedule, retries, alerting). Backfill history.",
      "Day 4: Build a dashboard of 5–7 KPIs that answers 3 concrete business questions.",
      "Day 5: Write up the insights (with numbers) and a data dictionary in the README.",
    ],
    bullets: [
      "Built an automated {domain} ELT pipeline ({stack}) ingesting [N]M rows daily into a tested star-schema warehouse with [N] dbt models and [N] data-quality checks",
      "Orchestrated daily runs in Airflow with retries and alerting, holding [N]% pipeline success and cutting manual reporting by [N] hours/week",
      "Delivered a KPI dashboard answering [N] business questions; surfaced [insight] that would affect [metric] by [N]%",
    ],
    stretch: ["Streaming ingestion", "Slowly-changing dimensions", "Anomaly detection on KPIs"],
    talking_points: ["Data modeling choices", "Testing data quality", "Incremental vs full loads"],
    effort_hours: [15, 25],
  },
  {
    id: "ml_production",
    skills: ["Machine Learning", "scikit-learn", "XGBoost", "PyTorch", "TensorFlow", "Deep Learning", "MLOps", "Python", "FastAPI", "Docker", "Statistics", "Computer Vision", "Natural Language Processing", "Recommendation Systems", "Jupyter", "Pandas", "NumPy"],
    name: "{Domain} {Entity} Prediction Model: Notebook to Production",
    pitch: "A model that predicts a meaningful {domain} outcome, taken from EDA all the way to a monitored, containerized inference API with experiment tracking.",
    build_plan: [
      "Day 1: Frame the {domain} prediction problem, do EDA, and fit a baseline model with a proper validation split.",
      "Day 2: Feature engineering and model comparison, tracked in MLflow. Pick the model on a business-relevant metric.",
      "Day 3: Serve it with FastAPI, containerize, and add input validation plus a batch endpoint.",
      "Day 4: Drift and performance monitoring. Automate retraining with a simple pipeline.",
      "Day 5: Write a model card (limitations, fairness checks) and put results in the README.",
    ],
    bullets: [
      "Developed a {domain} {entity} prediction model ({stack}) reaching [metric] of [X], [N]% better than the baseline, with experiments tracked in MLflow",
      "Deployed the model as a containerized FastAPI service handling [N] predictions/sec at p95 latency of [N] ms, with input validation and batch scoring",
      "Added data-drift monitoring and automated retraining, and documented model limitations and fairness checks in a model card",
    ],
    stretch: ["A/B test harness", "Feature store", "Explainability with SHAP"],
    talking_points: ["Metric choice vs business goal", "Leakage and validation", "Monitoring in production"],
    effort_hours: [18, 30],
  },
  {
    id: "mobile_app",
    skills: ["React Native", "Flutter", "iOS Development", "Android Development", "Swift", "Kotlin", "Dart", "Expo", "Firebase", "TypeScript", "REST APIs", "Unit Testing"],
    name: "{Domain} Companion Mobile App",
    pitch: "A cross-platform mobile app where {users} track and act on {entities}. It works offline-first, has push notifications, auth, and is published to TestFlight / Play internal testing.",
    build_plan: [
      "Day 1: Scaffold the app with navigation and auth, and set up a design system.",
      "Day 2: {Entity} screens backed by a local offline store, with background sync.",
      "Day 3: Push notifications, deep links, and camera or location integration if relevant.",
      "Day 4: Tests, crash reporting and analytics. Profile startup time and frame drops.",
      "Day 5: Ship to TestFlight or Play internal testing, then write the README with screenshots and a demo GIF.",
    ],
    bullets: [
      "Built and shipped a cross-platform {domain} mobile app in {stack} with offline-first sync, push notifications and secure auth, released to [N] beta testers",
      "Cut cold-start time by [N]% and held 60 fps scrolling on lists of [N]+ items through profiling and list virtualization",
      "Set up crash reporting, analytics and automated tests, reaching a [N]% crash-free session rate in beta",
    ],
    stretch: ["Widgets / watch app", "Accessibility audit", "In-app purchases"],
    talking_points: ["Offline sync conflicts", "Native vs cross-platform trade-offs", "Release process"],
    effort_hours: [18, 30],
  },
  {
    id: "sre_observability",
    skills: ["Site Reliability Engineering", "Observability", "Prometheus", "Grafana", "OpenTelemetry", "Datadog", "Kubernetes", "Load Testing", "Incident Management", "Linux", "Performance Optimization", "Scalability", "Docker", "Go", "Python", "Bash"],
    name: "SLO-Driven Reliability Lab for a {Domain} Service",
    pitch: "A {domain} service on Kubernetes with full observability (metrics, logs, traces), defined SLOs with error budgets, load tests, chaos experiments, and written incident postmortems.",
    build_plan: [
      "Day 1: Deploy a sample {domain} service to a local Kubernetes cluster (kind/k3d) with Helm.",
      "Day 2: Prometheus metrics, OpenTelemetry traces and centralized logs, plus Grafana dashboards.",
      "Day 3: Define SLIs/SLOs with multi-window burn-rate alerts.",
      "Day 4: Load test to find the saturation point. Tune resources and autoscaling (HPA).",
      "Day 5: Run 2 chaos experiments (pod kill, latency injection), write postmortems, and publish the results.",
    ],
    bullets: [
      "Defined SLIs/SLOs and burn-rate alerting for a {domain} service on Kubernetes, with Prometheus, Grafana and OpenTelemetry giving full request visibility",
      "Found and fixed a saturation bottleneck under k6 load testing, raising sustainable throughput from [X] to [Y] req/s through resource tuning and HPA",
      "Ran chaos experiments (pod failure, latency injection) and wrote blameless postmortems, cutting simulated MTTR from [X] to [Y] minutes",
    ],
    stretch: ["Canary analysis", "Runbook automation", "eBPF-based profiling"],
    talking_points: ["Choosing SLIs", "Alert fatigue", "Capacity planning"],
    effort_hours: [15, 25],
  },
  {
    id: "security_auth",
    skills: ["Application Security", "OAuth 2.0", "JWT", "Identity and Access Management", "Encryption", "Threat Modeling", "Vulnerability Management", "Cybersecurity", "Penetration Testing", "Zero Trust", "Compliance"],
    name: "Secure {Domain} Auth Gateway with Threat Model",
    pitch: "An authentication and authorization gateway for a {domain} app with OAuth2/OIDC, MFA, RBAC and audit logging, backed by a written threat model, automated security scans, and a fix report for OWASP Top 10 issues.",
    build_plan: [
      "Day 1: Write a STRIDE threat model for the {domain} app and pick controls.",
      "Day 2: OIDC login, short-lived JWTs with refresh rotation, MFA, and RBAC.",
      "Day 3: Audit logging, rate limiting, and encryption at rest and in transit.",
      "Day 4: SAST/DAST and dependency scanning in CI. Fix the findings.",
      "Day 5: Self pen-test against OWASP Top 10 and write up the findings and fixes.",
    ],
    bullets: [
      "Built an OAuth2/OIDC authentication gateway for a {domain} app with MFA, refresh-token rotation and role-based access control",
      "Wrote a STRIDE threat model and remediated [N] findings from SAST/DAST scans and a self-run OWASP Top 10 assessment",
      "Added tamper-evident audit logging and rate limiting, and enforced encryption in transit and at rest",
    ],
    stretch: ["Passkeys/WebAuthn", "Secrets rotation", "SOC 2-style control mapping"],
    talking_points: ["Token storage trade-offs", "Threat modeling process", "Defense in depth"],
    effort_hours: [15, 25],
  },
  {
    id: "test_automation",
    skills: ["Test Automation", "Playwright", "Cypress", "Selenium", "End-to-End Testing", "Unit Testing", "Integration Testing", "Load Testing", "CI/CD", "Postman", "pytest", "JUnit", "Test-Driven Development", "Behavior-Driven Development", "Manual Testing"],
    name: "Test Automation Framework for a {Domain} Web App",
    pitch: "A maintainable test framework (page objects, fixtures, parallel runs) covering UI, API and performance tests for a public {domain} demo app, with a flaky-test dashboard in CI.",
    build_plan: [
      "Day 1: Framework skeleton with page objects, fixtures, config per environment, and reporting.",
      "Day 2: 25+ UI E2E tests over the critical {domain} user journeys.",
      "Day 3: API contract tests and test-data factories.",
      "Day 4: Parallel runs in GitHub Actions, retries with flake tracking, and a trend report.",
      "Day 5: Performance smoke tests, then document the test strategy and coverage map.",
    ],
    bullets: [
      "Designed a {stack} test automation framework with page objects and fixtures covering [N] critical {domain} user journeys across UI and API layers",
      "Cut suite runtime from [X] to [Y] minutes with parallel CI execution and brought the flaky-test rate under [N]% through flake tracking and isolation",
      "Added API contract tests and k6 performance smoke tests to the pipeline, catching regressions before merge",
    ],
    stretch: ["Visual regression", "Mutation testing", "Accessibility checks in CI"],
    talking_points: ["Test pyramid", "Handling flakiness", "What not to automate"],
    effort_hours: [12, 20],
  },
  {
    id: "systems_core",
    skills: ["Distributed Systems", "Concurrency", "Data Structures", "Algorithms", "System Design", "Go", "Rust", "C++", "Java", "Performance Optimization", "Networking", "Operating Systems", "Scalability", "gRPC", "Caching"],
    name: "Distributed Rate Limiter and Cache for {Domain} Traffic",
    pitch: "A from-scratch distributed rate limiter and LRU cache (consistent hashing, replication, gRPC) benchmarked against realistic {domain} traffic patterns.",
    build_plan: [
      "Day 1: Implement the LRU cache and token-bucket / sliding-window limiters, with unit tests and benchmarks.",
      "Day 2: Distribute across nodes with consistent hashing over gRPC.",
      "Day 3: Replication and failure handling (node loss, rebalancing).",
      "Day 4: Concurrency tuning (lock striping or lock-free), then profile and optimize.",
      "Day 5: Benchmark report (throughput and latency percentiles) and a design doc covering trade-offs.",
    ],
    bullets: [
      "Implemented a distributed rate limiter and LRU cache in {stack} using consistent hashing and gRPC, sustaining [N]k ops/sec at p99 latency of [N] µs",
      "Improved throughput by [N]% under contention through lock striping and profiling-driven optimization",
      "Wrote a design doc analyzing consistency, failure modes and rebalancing trade-offs, backed by reproducible benchmarks",
    ],
    stretch: ["Raft-based consensus", "Persistence with WAL", "Client-side load balancing"],
    talking_points: ["CAP trade-offs", "Hot keys", "Benchmark methodology"],
    effort_hours: [20, 35],
  },
  {
    id: "oss_contribution",
    skills: ["Open Source", "Git", "Code Review", "Technical Documentation", "Collaboration", "Communication"],
    name: "Open-Source Contributions to the {Stack} Ecosystem",
    pitch: "Merged pull requests to 1–3 open-source projects the target team uses. This is the most credible proof that you can work in a real codebase with review.",
    build_plan: [
      "Day 1: Pick 2–3 repos in the JD's stack. Filter issues labeled 'good first issue' or 'help wanted' and read CONTRIBUTING.md.",
      "Days 2–4: Reproduce the issue, fix it with tests, open the PR, and respond to review quickly.",
      "Day 5+: Take on a second, larger issue, or improve documentation and examples.",
    ],
    bullets: [
      "Contributed [N] merged pull requests to [project] ([N]k+ GitHub stars), including [fix/feature], after code review by core maintainers",
      "Fixed [issue] affecting [N] users, adding regression tests and documentation updates",
    ],
    stretch: ["Become a triager", "Write a blog post on the fix"],
    talking_points: ["Navigating an unfamiliar codebase", "Handling review feedback"],
    effort_hours: [10, 30],
  },
  {
    id: "business_case",
    skills: ["Data Analysis", "Microsoft Excel", "SQL", "Power BI", "Tableau", "Project Management", "Stakeholder Management", "Business Analysis", "Operations Management", "Financial Analysis", "Budgeting", "Product Management", "Requirements Gathering", "Digital Marketing", "Marketing Analytics", "Sales", "Customer Success", "Supply Chain Management", "Strategic Planning"],
    name: "{Domain} Performance Case Study and Recommendation",
    pitch: "An analyst-grade case study on public {domain} data: define the problem, analyze it, build a dashboard, and present a costed recommendation, the way you would to a hiring manager.",
    build_plan: [
      "Day 1: Pick a public {domain} dataset. Write a one-page problem statement with 3 hypotheses.",
      "Day 2: Clean and analyze the data (SQL/Excel), quantifying the size of the opportunity.",
      "Day 3: Build a dashboard of 5 KPIs.",
      "Day 4: Write a recommendation memo with costs, risks, rollout plan and success metrics.",
      "Day 5: Turn it into a 6-slide deck and publish it (portfolio, LinkedIn post, or GitHub).",
    ],
    bullets: [
      "Analyzed [N]k rows of {domain} data with {stack} to find [insight], sizing a [N]% / $[N] improvement opportunity",
      "Built a [N]-KPI dashboard and a costed recommendation memo with rollout plan, risks and success metrics",
      "Presented the findings as an executive deck and published the analysis at [link]",
    ],
    stretch: ["Forecast scenarios", "Stakeholder interview synthesis"],
    talking_points: ["How you framed the problem", "Assumptions and sensitivity", "What you'd do with real internal data"],
    effort_hours: [10, 18],
  },
];

export interface DomainTheme {
  match: RegExp;
  domain: string;
  entity: string;
  entities: string;
  event: string;
  users: string;
}

export const DOMAIN_THEMES: DomainTheme[] = [
  { match: /\b(payments?|fintech|banking|lending|card|merchant|ledger|trading|brokerage|insurance)\b/i, domain: "payments", entity: "transaction", entities: "transactions", event: "payment", users: "merchants" },
  { match: /\b(health|clinical|patient|medical|ehr|hospital|pharma|biotech)\b/i, domain: "healthcare", entity: "appointment", entities: "patient appointments", event: "clinical", users: "clinicians" },
  { match: /\b(e-?commerce|retail|shopping|marketplace|checkout|catalog)\b/i, domain: "e-commerce", entity: "order", entities: "orders", event: "order", users: "shoppers" },
  { match: /\b(logistics|supply chain|shipping|delivery|fleet|warehouse|freight)\b/i, domain: "logistics", entity: "shipment", entities: "shipments", event: "tracking", users: "dispatchers" },
  { match: /\b(ads?|advertising|adtech|marketing|campaign)\b/i, domain: "ad-tech", entity: "campaign", entities: "campaigns", event: "impression", users: "advertisers" },
  { match: /\b(education|edtech|learning|students?|courses?)\b/i, domain: "ed-tech", entity: "course", entities: "courses", event: "learning", users: "learners" },
  { match: /\b(gaming|games?|player)\b/i, domain: "gaming", entity: "match", entities: "matches", event: "gameplay", users: "players" },
  { match: /\b(travel|booking|hotel|airline|hospitality)\b/i, domain: "travel", entity: "booking", entities: "bookings", event: "booking", users: "travelers" },
  { match: /\b(security|threat|soc|identity|fraud)\b/i, domain: "security", entity: "alert", entities: "security alerts", event: "security", users: "analysts" },
  { match: /\b(real estate|property|rental|housing)\b/i, domain: "real-estate", entity: "listing", entities: "listings", event: "listing", users: "agents" },
  { match: /\b(hr|recruiting|talent|payroll|workforce)\b/i, domain: "HR-tech", entity: "candidate", entities: "candidates", event: "hiring", users: "recruiters" },
  { match: /\b(energy|climate|sustainability|carbon|solar|grid)\b/i, domain: "climate-tech", entity: "meter reading", entities: "energy readings", event: "telemetry", users: "operators" },
  { match: /\b(media|streaming|video|music|content)\b/i, domain: "media-streaming", entity: "stream", entities: "content streams", event: "playback", users: "viewers" },
  { match: /\b(social|community|messaging|chat)\b/i, domain: "social", entity: "post", entities: "posts", event: "engagement", users: "members" },
  { match: /\b(iot|devices?|sensors?|embedded|automotive|vehicle)\b/i, domain: "IoT", entity: "device", entities: "devices", event: "telemetry", users: "operators" },
  { match: /\b(saas|b2b|enterprise|crm|workflow)\b/i, domain: "B2B SaaS", entity: "workspace", entities: "workspaces", event: "workflow", users: "team admins" },
];

export const DEFAULT_THEME: Omit<DomainTheme, "match"> = {
  domain: "productivity",
  entity: "task",
  entities: "tasks",
  event: "activity",
  users: "users",
};
