import { execSync } from "node:child_process";

export async function initGit(dir: string): Promise<boolean> {
  try {
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync("git add -A", { cwd: dir, stdio: "ignore" });
    execSync(
      'git commit -m "chore: initial commit (scaffolded by create-blaze)"',
      { cwd: dir, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}
