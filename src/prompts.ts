import * as clack from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import { scaffold } from "./scaffold.js";
import { detectPkgManager, install } from "./pkgManager.js";
import { initGit } from "./git.js";
import {
  toPackageName,
  isValidPackageName,
  isEmpty,
  renderSummaryBox,
} from "./utils.js";

export type Template =
  | "blaze-worker"
  | "workers-ai"
  | "workers-fullstack"
  | "workers-auth-jwt";
export type Language = "ts" | "js";
export type PkgMgr = "npm" | "pnpm" | "bun";

export interface Answers {
  dir: string; // absolute path
  name: string; // npm package name
  template: Template;
  language: Language;
  pkgMgr: PkgMgr;
  git: boolean;
}

export async function run(): Promise<void> {
  // Banner
  console.log();
  console.log(
    `  ${pc.bold(pc.white("🔥 Blaze"))}  ${pc.dim("— Web Framework for Cloudflare Workers")}`,
  );
  console.log(`  ${pc.dim("─".repeat(49))}`);
  console.log();

  clack.intro(pc.bgRed(pc.black(" create-blaze ")));

  // --- Step 1: Directory ---
  const cliArg = process.argv[2];
  let rawDir: string;

  if (cliArg && !cliArg.startsWith("-")) {
    rawDir = cliArg;
  } else {
    const result = await clack.text({
      message: "Where should we create your project?",
      placeholder: "./my-blaze-app",
      defaultValue: "./my-blaze-app",
      validate(v) {
        const name = toPackageName(v);
        if (!isValidPackageName(name))
          return "Must be a valid npm package name (lowercase, hyphens only)";
      },
    });
    if (clack.isCancel(result)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    rawDir = result as string;
  }

  const absDir = path.resolve(process.cwd(), rawDir);
  const name = toPackageName(rawDir);

  if (!isEmpty(absDir)) {
    const proceed = await clack.confirm({
      message: "Directory is not empty. Continue anyway?",
    });
    if (clack.isCancel(proceed) || !proceed) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
  }

  // --- Step 2: Template ---
  const template = await clack.select<Template>({
    message: "Which template would you like to use?",
    options: [
      {
        value: "blaze-worker",
        label: "blaze-worker",
        hint: "Bare minimum — one fetch handler, ready to deploy",
      },
      {
        value: "workers-ai",
        label: "workers-ai",
        hint: "Workers AI — streaming chat & completions endpoint",
      },
      {
        value: "workers-fullstack",
        label: "workers-fullstack",
        hint: "API + Cloudflare Pages — HTML, assets, functions",
      },
      {
        value: "workers-auth-jwt",
        label: "workers-auth-jwt",
        hint: "JWT auth — bearer tokens, KV rate limiting, D1",
      },
    ],
    initialValue: "blaze-worker",
  });
  if (clack.isCancel(template)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  // --- Step 3: Language ---
  const language = await clack.select<Language>({
    message: "TypeScript or JavaScript?",
    options: [
      {
        value: "ts",
        label: "TypeScript",
        hint: "Full types — req.env, req.params, middleware all typed",
      },
      {
        value: "js",
        label: "JavaScript",
        hint: "No build step — edit and deploy directly",
      },
    ],
    initialValue: "ts",
  });
  if (clack.isCancel(language)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  // --- Step 4: Package manager ---
  const detectedMgr = detectPkgManager();
  const pkgMgr = await clack.select<PkgMgr>({
    message: "Package manager?",
    options: [
      { value: "npm", label: "npm" },
      { value: "pnpm", label: "pnpm" },
      { value: "bun", label: "bun" },
    ],
    initialValue: detectedMgr,
  });
  if (clack.isCancel(pkgMgr)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  // --- Step 5: Git ---
  const git = await clack.confirm({
    message: "Initialise a git repository?",
    initialValue: true,
  });
  if (clack.isCancel(git)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  // --- Summary ---
  const summary = renderSummaryBox({
    Project: name,
    Template: template as string,
    Language: language === "ts" ? "TypeScript" : "JavaScript",
    "Pkg mgr": pkgMgr as string,
    Git: git ? "Yes" : "No",
  });
  console.log(summary);

  const confirm = await clack.select({
    message: "Looks good?",
    options: [
      { value: "yes", label: "Yes, create it" },
      { value: "start", label: "No, start over" },
    ],
    initialValue: "yes",
  });
  if (clack.isCancel(confirm)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }
  if (confirm === "start") return run();

  const answers: Answers = {
    dir: absDir,
    name,
    template: template as Template,
    language: language as Language,
    pkgMgr: pkgMgr as PkgMgr,
    git: git as boolean,
  };

  // --- Scaffold ---
  const s = clack.spinner();
  s.start("Scaffolding project…");
  const fileCount = await scaffold(answers);
  s.stop(`Created ${fileCount} files`);

  // --- Install ---
  s.start("Installing dependencies…");
  const installResult = await install(absDir, answers.pkgMgr);
  if (installResult.success) {
    s.stop(`Installed in ${installResult.elapsed}s`);
  } else {
    s.stop(pc.yellow("Could not install dependencies automatically"));
    clack.log.warn(`Run manually: cd ${rawDir} && ${answers.pkgMgr} install`);
  }

  // --- Git ---
  if (answers.git) {
    s.start("Initialising git…");
    const ok = await initGit(absDir);
    s.stop(
      ok
        ? 'Committed as "chore: initial commit"'
        : pc.yellow("git init skipped — git not found"),
    );
  }

  // --- Done ---
  const rel = path.relative(process.cwd(), absDir);
  const cdLine =
    rel !== "." && rel !== "" ? `\n    ${pc.dim(`cd ${rel}`)}` : "";
  clack.outro(
    `${pc.bold("🔥 Your Blaze app is ready!")}` +
      `\n\n  Next steps:` +
      cdLine +
      `\n    ${pc.dim(`${answers.pkgMgr} run dev`)}` +
      `\n\n  Docs  →  ${pc.cyan("https://blazefw.dev")}`,
  );
}
