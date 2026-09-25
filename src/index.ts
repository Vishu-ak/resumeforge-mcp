#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { createServer, VERSION } from "./server.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`resumeforge-mcp v${VERSION}

Usage:
  resumeforge-mcp            Run over stdio (Claude Desktop, Cursor, VS Code, Claude Code, Windsurf)
  resumeforge-mcp --http     Run a remote Streamable HTTP server (ChatGPT connectors, claude.ai custom connectors)

Environment:
  PORT                       HTTP port (default 3333)
  HOST                       HTTP bind address (default 0.0.0.0)
  RESUMEFORGE_OUTPUT_DIR     Where rendered files are written in stdio mode (default ~/ResumeForge)
  RESUMEFORGE_ALLOWED_ORIGINS  Comma-separated CORS origins for HTTP mode (default *)
  RESUMEFORGE_API_KEY        If set, HTTP requests must send "Authorization: Bearer <key>"
  RESUMEFORGE_FONT_REGULAR / RESUMEFORGE_FONT_BOLD   TTF paths for full-Unicode PDFs`);
  process.exit(0);
}

async function readBody(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

async function runHttp() {
  const port = Number(process.env.PORT ?? 3333);
  const host = process.env.HOST ?? "0.0.0.0";
  const origins = (process.env.RESUMEFORGE_ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());

  const http = createHttpServer(async (req, res) => {
    const origin = req.headers.origin;
    const allow = origins.includes("*") ? "*" : origin && origins.includes(origin) ? origin : "";
    if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (url.pathname === "/" || url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ name: "resumeforge-mcp", version: VERSION, mcp_endpoint: "/mcp", status: "ok" }));
    }
    if (url.pathname !== "/mcp") return void res.writeHead(404).end("Not found");

    const apiKey = process.env.RESUMEFORGE_API_KEY;
    if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
      res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
      return void res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }));
    }

    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream or session teardown.
      res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
      return void res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    }

    try {
      const body = await readBody(req);
      // Stateless: a fresh server per request, nothing about the candidate is retained.
      const server = createServer({ writeFiles: false });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: (err as Error).message }, id: null }));
      }
    }
  });

  http.listen(port, host, () => {
    console.error(`resumeforge-mcp v${VERSION} listening on http://${host}:${port}/mcp`);
  });
}

async function runStdio() {
  const server = createServer({ writeFiles: true });
  await server.connect(new StdioServerTransport());
  console.error(`resumeforge-mcp v${VERSION} running on stdio`);
}

(args.includes("--http") ? runHttp() : runStdio()).catch((err) => {
  console.error(err);
  process.exit(1);
});
