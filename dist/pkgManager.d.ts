export type PkgManager = "npm" | "pnpm" | "bun";
export declare function detectPkgManager(): PkgManager;
export declare function install(dir: string, mgr: PkgManager): Promise<{
    success: boolean;
    elapsed: number;
    error?: string;
}>;
