import { execSync, spawn } from "node:child_process";

export type PkgManager = "npm" | "pnpm" | "bun";

export function detectPkgManager(): PkgManager {
  const execPath = process.env.npm_execpath ?? "";
  if (execPath.includes("pnpm")) return "pnpm";
  if (execPath.includes("bun")) return "bun";
  try {
    execSync("pnpm --version", { stdio: "ignore" });
    return "pnpm";
  } catch {}
  return "npm";
}

export async function install(
  dir: string,
  mgr: PkgManager,
): Promise<{ success: boolean; elapsed: number; error?: string }> {
  const commands: Record<PkgManager, string[]> = {
    npm: ["npm", "install"],
    pnpm: ["pnpm", "install"],
    bun: ["bun", "install"],
  };

  const start = Date.now();
  const [cmd, ...args] = commands[mgr];

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      stdio: "ignore",
      env: process.env,
    });

    let done = false;
    
    // Timeout after 120 seconds
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      resolve({
        success: false,
        elapsed: (Date.now() - start) / 1000,
        error: "Installation timed out after 120s"
      });
    }, 120000);

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      const elapsed = (Date.now() - start) / 1000;
      if (code === 0) {
        resolve({ success: true, elapsed });
      } else {
        resolve({
          success: false,
          elapsed,
          error: `${cmd} install exited with code ${code}`
        });
      }
    });
    
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        elapsed: (Date.now() - start) / 1000,
        error: err.message
      });
    });
  });
}
