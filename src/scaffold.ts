import fse from "fs-extra";
import path from "node:path";
import { today } from "./utils.js";
import type { Answers, Template, Language } from "./prompts.js";

function substitute(content: string, name: string): string {
  return content.replace(/<PROJECT_NAME>/g, name).replace(/<TODAY>/g, today());
}

function stripTypes(content: string): string {
  return content
    // Remove `import type ...`
    .replace(/^import\s+type\s+.*$/gm, '')
    // Remove `export type X = ...` or `type X = ...` (simple ones)
    .replace(/^(export\s+)?type\s+\w+\s*=\s*\{[^}]*\};?$/gm, '')
    // Remove `interface X { ... }`
    .replace(/^(export\s+)?interface\s+\w+\s*\{[^}]*\}/gm, '')
    // Remove `: ReturnType<typeof import("blazefw").createApp<Env>>`
    .replace(/:\s*ReturnType<typeof\s+import\([^)]+\)\.createApp(?:<Env>)?>/g, '')
    // Remove `Handler<Env>` type annotations
    .replace(/:\s*Handler<Env>/g, '')
    // Remove `<Env>` generic arguments
    .replace(/<Env>/g, '')
    // Remove `.json<{...}>()` -> `.json()`
    .replace(/\.json<\{[^}]+\}>\(\)/g, '.json()')
    // Remove `.first<{...}>()` -> `.first()`
    .replace(/\.first<\{[^}]+\}>\(\)/g, '.first()')
    // Remove `req.user!` -> `req.user`
    .replace(/req\.user!/g, 'req.user')
    // Remove `<GenericType>` from function calls (mostly for <[A-Z]...>)
    .replace(/<[A-Z][a-zA-Z0-9_]*>/g, '')
    // Remove `: TypeAnnotation` from variables/params (rough heuristic)
    .replace(/:\s*([A-Z][a-zA-Z0-9_]*|string|number|boolean|any|void)(?=[,)\s])/g, '')
    // Remove `as const` and `as SomeType`
    .replace(/\s+as\s+[a-zA-Z0-9_]+/g, '')
    // Remove `declare module "blazefw" { ... }` block
    .replace(/declare\s+module\s+"blazefw"\s*\{[^}]*\}[^}]*\}/g, '')
    // Fix any leftover consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

const sharedGitignore = `node_modules/
dist/
.wrangler/
.dev.vars
*.local
.DS_Store
Thumbs.db
`;

const sharedEditorconfig = `root = true

[*]
indent_style  = space
indent_size   = 2
end_of_line   = lf
charset       = utf-8
trim_trailing_whitespace = true
insert_final_newline     = true

[*.md]
trim_trailing_whitespace = false
`;

const sharedTsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true
  },
  "include": ["src/**/*", "*.d.ts"]
}`;

const blazeWorkerWrangler = `{
  "name": "<PROJECT_NAME>",
  "main": "src/index.ts",
  "compatibility_date": "<TODAY>",
  "observability": {
    "enabled": false
  }
}`;

const blazeWorkerPkg = `{
  "name": "<PROJECT_NAME>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "blazefw": "^1.0.0"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.4.0"
  }
}`;

const blazeWorkerIndexTs = `import { createApp } from "blazefw";

type Env = {
  // Add your Cloudflare bindings here:
  // KV: KVNamespace
  // DB: D1Database
  // R2: R2Bucket
};

const app = createApp<Env>();

app.get("/", (req, res) => {
  res.json({
    message: "Hello from Blaze 🔥",
    timestamp: Date.now(),
    colo: req.cf?.colo ?? "unknown",
  });
});

app.notFound((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

export default { fetch: app.fetch };
`;

const blazeWorkersAiEnv = `export type Env = {
  AI: Ai;
};
`;

const blazeWorkersAiIndexTs = `import { createApp } from "blazefw";
import { cors } from "blazefw/middleware/cors";
import { logger } from "blazefw/middleware/logger";
import type { Env } from "./types/env";

const app = createApp<Env>();

app.use(logger());
app.use(cors({ origins: "*" }));

// Non-streaming completion
app.post("/ai/complete", async (req, res) => {
  const { prompt, system } = await req.json<{
    prompt: string;
    system?: string;
  }>();

  if (!prompt) return res.status(422).json({ error: "prompt is required" });

  const result = await req.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content: prompt },
    ],
  });

  res.json(result);
});

// Streaming completion — Server-Sent Events
app.post("/ai/stream", async (req, res) => {
  const { prompt } = await req.json<{ prompt: string }>();

  if (!prompt) return res.status(422).json({ error: "prompt is required" });

  const stream = await req.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user" as const, content: prompt }],
    stream: true,
  });

  res.header("Content-Type", "text/event-stream");
  res.header("Cache-Control", "no-cache");
  res.stream((writer) => (stream as ReadableStream).pipeTo(writer));
});

// List available models
app.get("/ai/models", (req, res) => {
  res.json({
    models: [
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/mistral/mistral-7b-instruct-v0.1",
      "@cf/microsoft/phi-2",
    ],
  });
});

app.notFound((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

export default { fetch: app.fetch };
`;

const blazeWorkersAiWrangler = `{
  "name": "<PROJECT_NAME>",
  "main": "src/index.ts",
  "compatibility_date": "<TODAY>",
  "observability": {
    "enabled": false
  },
  "ai": {
    "binding": "AI"
  }
}`;

const blazeWorkersAiPkg = `{
  "name": "<PROJECT_NAME>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "blazefw": "^1.0.0"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.4.0"
  }
}`;

const workersFullstackEnv = `export type Env = {
  KV: KVNamespace;
  ASSETS: Fetcher; // CF Pages asset binding
};
`;

const workersFullstackIndexTs = `import { createApp, BlazeError } from "blazefw";
import { cors } from "blazefw/middleware/cors";
import { logger } from "blazefw/middleware/logger";
import { requestId } from "blazefw/middleware/request-id";
import type { Env } from "./types/env";

const app = createApp<Env>();

app.use(logger());
app.use(requestId());
app.use(cors({ origins: "*" }));

// API routes
app.get("/api", (req, res) => {
  res.json({
    name: "<PROJECT_NAME>",
    version: "0.1.0",
    status: "ok",
  });
});

app.get("/api/kv/:key", async (req, res) => {
  const value = await req.env.KV.get(req.params.key);
  if (value === null) throw new BlazeError(404, "Key not found");
  res.json({ key: req.params.key, value });
});

app.put("/api/kv/:key", async (req, res) => {
  const { value, ttl } = await req.json<{ value: string; ttl?: number }>();
  await req.env.KV.put(req.params.key, value, {
    expirationTtl: ttl,
  });
  res.status(201).json({ ok: true });
});

app.delete("/api/kv/:key", async (req, res) => {
  await req.env.KV.delete(req.params.key);
  res.status(204).send();
});

// Fallthrough to static assets for all non-API routes
app.all("*", async (req, res) => {
  const response = await req.env.ASSETS.fetch(req.raw);
  res.raw(response);
});

app.onError((err, req, res, next) => {
  if (err instanceof BlazeError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default { fetch: app.fetch };
`;

const workersFullstackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><PROJECT_NAME></title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="container">
    <h1>🔥 <PROJECT_NAME></h1>
    <p class="subtitle">Powered by Blaze + Cloudflare Workers</p>

    <div class="card">
      <h2>API Status</h2>
      <pre id="status">Loading…</pre>
    </div>

    <div class="card">
      <h2>KV Store</h2>
      <div class="row">
        <input id="kv-key"   placeholder="key"   />
        <input id="kv-value" placeholder="value" />
        <button onclick="kvSet()">Set</button>
        <button onclick="kvGet()">Get</button>
      </div>
      <pre id="kv-result"></pre>
    </div>
  </div>

  <script>
    async function load() {
      const r = await fetch('/api')
      document.getElementById('status').textContent =
        JSON.stringify(await r.json(), null, 2)
    }

    async function kvSet() {
      const key   = document.getElementById('kv-key').value
      const value = document.getElementById('kv-value').value
      const r = await fetch(\`/api/kv/\${key}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      document.getElementById('kv-result').textContent =
        JSON.stringify(await r.json(), null, 2)
    }

    async function kvGet() {
      const key = document.getElementById('kv-key').value
      const r   = await fetch(\`/api/kv/\${key}\`)
      document.getElementById('kv-result').textContent =
        JSON.stringify(await r.json(), null, 2)
    }

    load()
  </script>
</body>
</html>
`;

const workersFullstackCss = `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: system-ui, sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
  padding: 2rem;
}
.container {
  max-width: 720px;
  margin: 0 auto;
}
h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
}
.subtitle {
  color: #666;
  margin-bottom: 2rem;
}
.card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
h2 {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: #444;
}
pre {
  background: #f0f0f0;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: pre-wrap;
}
.row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
input {
  flex: 1;
  min-width: 120px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}
button {
  padding: 0.5rem 1rem;
  background: #e8501a;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
button:hover {
  background: #c94416;
}
`;

const workersFullstackWrangler = `{
  "name": "<PROJECT_NAME>",
  "main": "src/index.ts",
  "compatibility_date": "<TODAY>",
  "observability": {
    "enabled": false
  },
  "assets": {
    "directory": "./public"
  },
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": ""
    }
  ]
}`;

const workersFullstackPkg = `{
  "name": "<PROJECT_NAME>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "blazefw": "^1.0.0"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.4.0"
  }
}`;

const workersAuthJwtEnv = `export type Env = {
  DB: D1Database;
  RATE_LIMIT_KV: KVNamespace;
  JWT_SECRET: string;
};
`;

const workersAuthJwtBlazeDts = `declare module "blazefw" {
  interface BlazeRequestExtensions {
    user?: {
      id: string;
      email: string;
      role: "user" | "admin";
    };
  }
}
`;

const workersAuthJwtRequireAuth = `import { jwtAuth } from "blazefw/middleware/jwt";
import type { Env } from "../types/env";

export const requireAuth = jwtAuth<Env>({
  secret: (req) => req.env.JWT_SECRET
});
`;

const workersAuthJwtRoutesAuth = `import { BlazeError } from "blazefw";
import type { Env } from "../types/env";

// createRouter is passed in from index.ts
export function createAuthRouter(
  app: ReturnType<typeof import("blazefw").createApp<Env>>,
) {
  const router = app.Router();

  // POST /auth/login — returns a signed JWT
  router.post("/login", async (req, res) => {
    const { email, password } = await req.json<{
      email: string;
      password: string;
    }>();
    if (!email || !password)
      throw new BlazeError(422, "email and password are required");

    const user = await req.env.DB.prepare(
      "SELECT id, email, role, password_hash FROM users WHERE email = ?",
    )
      .bind(email)
      .first<{
        id: string;
        email: string;
        role: string;
        password_hash: string;
      }>();

    if (!user) throw new BlazeError(401, "Invalid credentials");

    // Verify password hash (SHA-256 for demo — use bcrypt in production via external API)
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(password),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (hash !== user.password_hash)
      throw new BlazeError(401, "Invalid credentials");

    // Build JWT (HS256)
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      iat: now,
      exp: now + 86400,
    };

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replace(/=/g, "")
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_");
    const body = btoa(JSON.stringify(payload))
      .replace(/=/g, "")
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_");

    const encoder = new TextEncoder();
    const keyData = encoder.encode(req.env.JWT_SECRET);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigArray = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(\`\${header}.\${body}\`),
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigArray)))
      .replace(/=/g, "")
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_");

    res.json({ token: \`\${header}.\${body}.\${sig}\`, expiresIn: 86400 });
  });

  return router;
}
`;

const workersAuthJwtRoutesUsers = `import { BlazeError } from "blazefw";
import { requireAuth } from "../middleware/requireAuth";
import type { Env } from "../types/env";

export function createUsersRouter(
  app: ReturnType<typeof import("blazefw").createApp<Env>>,
) {
  const router = app.Router();

  // All routes in this router require auth
  router.use(requireAuth);

  // GET /users/me
  router.get("/me", async (req, res) => {
    const user = await req.env.DB.prepare(
      "SELECT id, email, role, created_at FROM users WHERE id = ?",
    )
      .bind(req.user!.id)
      .first();
    if (!user) throw new BlazeError(404, "User not found");
    res.json(user);
  });

  // GET /users/:id  (admin only)
  router.get("/:id", async (req, res) => {
    if (req.user?.role !== "admin")
      throw new BlazeError(403, "Admin access required");
    const user = await req.env.DB.prepare(
      "SELECT id, email, role, created_at FROM users WHERE id = ?",
    )
      .bind(req.params.id)
      .first();
    if (!user) throw new BlazeError(404, "User not found");
    res.json(user);
  });

  return router;
}
`;

const workersAuthJwtIndexTs = `import { createApp, BlazeError } from "blazefw";
import { cors } from "blazefw/middleware/cors";
import { logger } from "blazefw/middleware/logger";
import { requestId } from "blazefw/middleware/request-id";
import { rateLimit } from "blazefw/middleware/rate-limit";
import { createAuthRouter } from "./routes/auth";
import { createUsersRouter } from "./routes/users";
import type { Env } from "./types/env";

const app = createApp<Env>();

// Global middleware
app.use(requestId());
app.use(logger());
app.use(cors({ origins: "*" }));

// Rate limit all routes — 100 req/min per IP using KV
app.use(rateLimit({ windowMs: 60_000, max: 100 }));

// Mount routers
app.use("/auth", createAuthRouter(app));
app.use("/users", createUsersRouter(app));

// Health check (no auth)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Global error handler
app.onError((err, req, res, next) => {
  if (err instanceof BlazeError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default { fetch: app.fetch };
`;

const workersAuthJwtSchema = `-- Run with: wrangler d1 execute <DB_NAME> --file schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Seed an admin user (password: "admin123" — change immediately)
INSERT OR IGNORE INTO users (id, email, password_hash, role)
VALUES (
  'admin-seed-001',
  'admin@example.com',
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  'admin'
);
`;

const workersAuthJwtWrangler = `{
  "name": "<PROJECT_NAME>",
  "main": "src/index.ts",
  "compatibility_date": "<TODAY>",
  "observability": {
    "enabled": false
  },
  "kv_namespaces": [
    {
      "binding": "RATE_LIMIT_KV",
      "id": ""
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "<PROJECT_NAME>-db",
      "database_id": ""
    }
  ],
  "vars": {
    "JWT_SECRET": "change-me-in-production-use-wrangler-secret-put"
  }
}`;

const workersAuthJwtPkg = `{
  "name": "<PROJECT_NAME>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "blazefw": "^1.0.0"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.4.0"
  }
}`;


export async function scaffold(opts: Answers): Promise<number> {
  const { dir, name, template, language } = opts;
  
  const files: Record<string, string> = {
    ".gitignore": sharedGitignore,
    ".editorconfig": sharedEditorconfig,
  };
  
  if (language === 'ts') {
    files["tsconfig.json"] = sharedTsconfig;
  }
  
  if (template === "blaze-worker") {
    files["wrangler.jsonc"] = blazeWorkerWrangler;
    files["package.json"] = blazeWorkerPkg;
    files["src/index.ts"] = blazeWorkerIndexTs;
  } else if (template === "workers-ai") {
    files["wrangler.jsonc"] = blazeWorkersAiWrangler;
    files["package.json"] = blazeWorkersAiPkg;
    files["src/index.ts"] = blazeWorkersAiIndexTs;
    files["src/types/env.ts"] = blazeWorkersAiEnv;
  } else if (template === "workers-fullstack") {
    files["wrangler.jsonc"] = workersFullstackWrangler;
    files["package.json"] = workersFullstackPkg;
    files["src/index.ts"] = workersFullstackIndexTs;
    files["src/types/env.ts"] = workersFullstackEnv;
    files["public/index.html"] = workersFullstackHtml;
    files["public/style.css"] = workersFullstackCss;
  } else if (template === "workers-auth-jwt") {
    files["wrangler.jsonc"] = workersAuthJwtWrangler;
    files["package.json"] = workersAuthJwtPkg;
    files["schema.sql"] = workersAuthJwtSchema;
    files["src/index.ts"] = workersAuthJwtIndexTs;
    files["src/types/env.ts"] = workersAuthJwtEnv;
    files["src/types/blaze.d.ts"] = workersAuthJwtBlazeDts;
    files["src/middleware/requireAuth.ts"] = workersAuthJwtRequireAuth;
    files["src/routes/auth.ts"] = workersAuthJwtRoutesAuth;
    files["src/routes/users.ts"] = workersAuthJwtRoutesUsers;
  }

  let fileCount = 0;
  for (const [filepath, content] of Object.entries(files)) {
    let finalContent = substitute(content, name);
    let finalPath = filepath;

    if (language === 'js' && filepath.startsWith("src/types/")) {
      continue;
    }

    if (language === 'js' && filepath.endsWith('.ts')) {
      finalPath = filepath.replace(/\.ts$/, '.js');
      finalContent = stripTypes(finalContent);
    }
    
    if (language === 'js' && filepath === "package.json") {
      const pkg = JSON.parse(finalContent);
      pkg.scripts.typecheck = "echo 'JS mode — no typecheck'";
      delete pkg.devDependencies["typescript"];
      delete pkg.devDependencies["@cloudflare/workers-types"];
      finalContent = JSON.stringify(pkg, null, 2);
    }
    
    if (language === 'js' && filepath === "wrangler.jsonc") {
      finalContent = finalContent.replace('"src/index.ts"', '"src/index.js"');
    }

    const fullPath = path.join(dir, finalPath);
    await fse.outputFile(fullPath, finalContent);
    fileCount++;
  }
  return fileCount;
}
