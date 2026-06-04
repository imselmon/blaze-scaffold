export type Template = "blaze-worker" | "workers-ai" | "workers-fullstack" | "workers-auth-jwt";
export type Language = "ts" | "js";
export type PkgMgr = "npm" | "pnpm" | "bun";
export interface Answers {
    dir: string;
    name: string;
    template: Template;
    language: Language;
    pkgMgr: PkgMgr;
    git: boolean;
}
export declare function run(): Promise<void>;
