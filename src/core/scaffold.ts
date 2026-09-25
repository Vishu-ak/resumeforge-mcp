/**
 * Starter repositories for bridge projects, so "In Progress" becomes "Built"
 * in a weekend. Every skeleton runs out of the box: a /health endpoint, one
 * passing test, CI, and a README that carries the build plan and results table.
 */
import { pickTheme } from "./bridge.js";

export type ScaffoldLanguage = "go" | "python" | "typescript" | "java";

export interface ScaffoldInput {
  name: string;
  pitch?: string;
  stack?: string[];
  closes_gaps?: string[];
  build_plan?: string[];
  resume_bullets_template?: string[];
  interview_talking_points?: string[];
  language?: ScaffoldLanguage;
  jd_text?: string;
  github_username?: string;
}

export interface ScaffoldResult {
  repo_name: string;
  language: ScaffoldLanguage;
  files: Record<string, string>;
  next_steps: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function detectLanguage(stack: string[]): ScaffoldLanguage {
  const s = stack.join(" ");
  if (/\bGo\b|Golang/.test(s)) return "go";
  if (/Python|FastAPI|Django|Flask|PyTorch|TensorFlow|scikit|Pandas|Airflow|dbt|LangChain|LlamaIndex|Spark/i.test(s)) return "python";
  if (/Java\b|Spring|Kotlin/.test(s)) return "java";
  return "typescript";
}

function compose(stack: string[]): string | null {
  const s = stack.join(" ");
  const services: string[] = [];
  if (/PostgreSQL|Postgres|Amazon RDS/i.test(s)) {
    services.push(`  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports: ["5432:5432"]`);
  }
  if (/MySQL/i.test(s)) {
    services.push(`  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: app
      MYSQL_DATABASE: app
    ports: ["3306:3306"]`);
  }
  if (/Redis|Caching/i.test(s)) services.push(`  redis:
    image: redis:7
    ports: ["6379:6379"]`);
  if (/MongoDB/i.test(s)) services.push(`  mongo:
    image: mongo:7
    ports: ["27017:27017"]`);
  if (/Kafka/i.test(s)) {
    services.push(`  kafka:
    image: apache/kafka:3.8.0
    ports: ["9092:9092"]`);
  }
  if (/RabbitMQ/i.test(s)) services.push(`  rabbitmq:
    image: rabbitmq:3-management
    ports: ["5672:5672", "15672:15672"]`);
  if (/Prometheus|Observability|OpenTelemetry/i.test(s)) services.push(`  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]`);
  if (/Grafana/i.test(s)) services.push(`  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]`);
  return services.length ? `# Local dependencies: docker compose up -d\nservices:\n${services.join("\n")}\n` : null;
}

function readme(i: ScaffoldInput, lang: ScaffoldLanguage, repo: string, run: string[]): string {
  const plan = (i.build_plan ?? ["Day 1: Core feature", "Day 2: Tests and CI", "Day 3: Measure and write up results"]).map((p) => `- [ ] ${p}`);
  return [
    `# ${i.name}`,
    "",
    i.pitch ?? "",
    "",
    "## Why this project",
    i.closes_gaps?.length ? `Built to get hands-on, production-style experience with **${i.closes_gaps.join(", ")}**.` : "",
    "",
    "## Stack",
    (i.stack ?? []).map((s) => `\`${s}\``).join(" · ") || `\`${lang}\``,
    "",
    "## Architecture",
    "```mermaid",
    "flowchart LR",
    "    Client --> API[Service]",
    "    API --> Store[(Data store)]",
    "    %% TODO: replace with your real architecture as you build",
    "```",
    "",
    "## Build plan",
    ...plan,
    "",
    "## Results",
    "Measure these before and after each change. They become your resume bullets.",
    "",
    "| Metric | Before | After | How measured |",
    "|---|---|---|---|",
    "| p95 latency | | | |",
    "| Throughput | | | |",
    "| Test coverage | | | |",
    "",
    "## Run it",
    "```bash",
    ...run,
    "```",
    "",
    ...(i.resume_bullets_template?.length
      ? ["## Resume bullets (fill with your measured numbers)", ...i.resume_bullets_template.map((b) => `- ${b}`), ""]
      : []),
    ...(i.interview_talking_points?.length ? ["## Be ready to discuss", ...i.interview_talking_points.map((t) => `- ${t}`), ""] : []),
    "---",
    `Scaffolded with [ResumeForge](https://github.com/Vishu-ak/resumeforge-mcp). Repo: \`${repo}\``,
    "",
  ].join("\n");
}

const BUILD_LOG = `# Build log

Write one entry per session. Real notes like these make interview answers easy.

| Date | What I built | Problem I hit | How I solved it | Metric |
|---|---|---|---|---|
| | | | | |
`;

export function scaffoldProject(i: ScaffoldInput): ScaffoldResult {
  const stack = i.stack ?? [];
  const lang = i.language ?? detectLanguage(stack);
  const repo = slug(i.name);
  const theme = pickTheme(i.jd_text ?? i.name);
  const resource = theme.entities.split(" ").pop()!.toLowerCase().replace(/[^a-z]/g, "") || "items";
  const files: Record<string, string> = {};
  const owner = i.github_username ?? "YOUR_GITHUB_USERNAME";
  let run: string[] = [];

  if (lang === "go") {
    files["go.mod"] = `module github.com/${owner}/${repo}\n\ngo 1.22\n`;
    files["cmd/server/main.go"] = `package main

import (
\t"log"
\t"net/http"
\t"os"

\t"github.com/${owner}/${repo}/internal/api"
)

func main() {
\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "8080"
\t}
\tlog.Printf("listening on :%s", port)
\tlog.Fatal(http.ListenAndServe(":"+port, api.NewRouter()))
}
`;
    files["internal/api/router.go"] = `package api

import (
\t"encoding/json"
\t"net/http"
)

// NewRouter wires the HTTP routes. Add your ${resource} endpoints here.
func NewRouter() http.Handler {
\tmux := http.NewServeMux()
\tmux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
\t\twriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
\t})
\tmux.HandleFunc("GET /api/v1/${resource}", func(w http.ResponseWriter, r *http.Request) {
\t\twriteJSON(w, http.StatusOK, []any{}) // TODO: read from your store
\t})
\treturn mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
\tw.Header().Set("Content-Type", "application/json")
\tw.WriteHeader(status)
\t_ = json.NewEncoder(w).Encode(v)
}
`;
    files["internal/api/router_test.go"] = `package api

import (
\t"net/http"
\t"net/http/httptest"
\t"testing"
)

func TestHealth(t *testing.T) {
\trec := httptest.NewRecorder()
\tNewRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
\tif rec.Code != http.StatusOK {
\t\tt.Fatalf("expected 200, got %d", rec.Code)
\t}
}
`;
    files[".gitignore"] = "bin/\n*.out\n.env\n";
    files[".github/workflows/ci.yml"] = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go vet ./...
      - run: go test -race ./...
`;
    run = ["go test ./...", "go run ./cmd/server   # http://localhost:8080/health"];
  } else if (lang === "python") {
    files["pyproject.toml"] = `[project]
name = "${repo}"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = ["fastapi>=0.110", "uvicorn>=0.29"]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]

[tool.pytest.ini_options]
testpaths = ["tests"]
`;
    files["app/__init__.py"] = "";
    files["app/main.py"] = `from fastapi import FastAPI

app = FastAPI(title="${i.name.replace(/"/g, "")}")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/${resource}")
def list_${resource}() -> list:
    return []  # TODO: read from your store
`;
    files["tests/__init__.py"] = "";
    files["tests/test_health.py"] = `from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
`;
    files[".gitignore"] = "__pycache__/\n.venv/\n*.pyc\n.env\n.pytest_cache/\n";
    files[".github/workflows/ci.yml"] = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install --upgrade pip && pip install -e ".[dev]"
      - run: pytest -q
`;
    run = ["python3 -m venv .venv && source .venv/bin/activate", "pip install --upgrade pip", 'pip install -e ".[dev]"', "pytest -q", "uvicorn app.main:app --reload   # http://localhost:8000/health"];
  } else if (lang === "typescript") {
    files["package.json"] = JSON.stringify(
      {
        name: repo,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { dev: "tsx watch src/index.ts", start: "tsx src/index.ts", test: "node --import tsx --test test/*.test.ts", typecheck: "tsc --noEmit" },
        devDependencies: { "@types/node": "^22.0.0", tsx: "^4.19.0", typescript: "^5.6.0" },
      },
      null,
      2,
    ) + "\n";
    files["tsconfig.json"] = JSON.stringify(
      { compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, include: ["src", "test"] },
      null,
      2,
    ) + "\n";
    files["src/app.ts"] = `import { createServer, type Server } from "node:http";

/** Add your ${resource} routes here. */
export function createApp(): Server {
  return createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return json(200, { status: "ok" });
    if (req.method === "GET" && req.url === "/api/v1/${resource}") return json(200, []); // TODO: read from your store
    json(404, { error: "not found" });
  });
}
`;
    files["src/index.ts"] = `import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8080);
createApp().listen(port, () => console.log(\`listening on :\${port}\`));
`;
    files["test/health.test.ts"] = `import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.ts";

test("GET /health returns ok", async () => {
  const server = createApp().listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(\`http://127.0.0.1:\${port}/health\`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  } finally {
    server.close();
  }
});
`;
    files[".gitignore"] = "node_modules/\ndist/\n.env\n";
    files[".github/workflows/ci.yml"] = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm test
`;
    run = ["npm install", "npm test", "npm run dev   # http://localhost:8080/health"];
  } else {
    files[".gitignore"] = "target/\nbuild/\n.gradle/\n.idea/\n*.iml\n.env\n";
    run = [
      "# Generate a Spring Boot skeleton into this folder:",
      "curl https://start.spring.io/starter.zip -d type=maven-project -d javaVersion=21 -d dependencies=web,actuator,validation -d name=app -o app.zip && unzip -o app.zip && rm app.zip",
      "./mvnw test",
      "./mvnw spring-boot:run   # http://localhost:8080/actuator/health",
    ];
  }

  const dc = compose(stack);
  if (dc) {
    files["docker-compose.yml"] = dc;
    run.unshift("docker compose up -d   # local dependencies");
  }
  files["README.md"] = readme(i, lang, repo, run);
  files["BUILD_LOG.md"] = BUILD_LOG;

  return {
    repo_name: repo,
    language: lang,
    files,
    next_steps: [
      `cd ${repo}`,
      "git init && git add -A && git commit -m \"Initial scaffold\"",
      `gh repo create ${repo} --public --source . --push   # or create the repo on github.com and push`,
      "Work through the README build plan and log progress in BUILD_LOG.md.",
      "Fill the Results table with measured numbers, then update the resume bullets and mark the project 'completed'.",
    ],
  };
}
