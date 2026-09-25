/**
 * Generates every bridge-project skeleton and runs its own tests.
 * Used in CI to prove the scaffolds work out of the box: `npm run smoke:scaffold`.
 * Needs go, python3 and node on PATH.
 */
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scaffoldProject } from "../src/core/scaffold.js";

const root = mkdtempSync(join(tmpdir(), "rf-smoke-"));
const cases = [
  { lang: "go", stack: ["Go", "Apache Kafka"], cmds: ["go vet ./...", "go test ./..."] },
  { lang: "python", stack: ["Python", "FastAPI"], cmds: ["python3 -m venv .venv", ".venv/bin/pip install -q --upgrade pip", '.venv/bin/pip install -q -e ".[dev]"', ".venv/bin/pytest -q"] },
  { lang: "typescript", stack: ["TypeScript", "Redis"], cmds: ["npm install --silent", "npm test", "npx tsc --noEmit"] },
] as const;

for (const c of cases) {
  const r = scaffoldProject({ name: `smoke ${c.lang}`, stack: [...c.stack], github_username: "resumeforge-smoke" });
  const dir = join(root, r.repo_name);
  for (const [p, body] of Object.entries(r.files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  for (const cmd of c.cmds) {
    console.log(`[${c.lang}] $ ${cmd}`);
    execSync(cmd, { cwd: dir, stdio: "inherit" });
  }
  console.log(`[${c.lang}] OK`);
}
