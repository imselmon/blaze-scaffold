import fse from "fs-extra";
import path from "node:path";
import pc from "picocolors";
export function toPackageName(dir) {
    return (path
        .basename(path.resolve(dir))
        .toLowerCase()
        .replace(/[^a-z0-9\-]/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-") || "my-blaze-app");
}
export function isValidPackageName(name) {
    return /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$/.test(name);
}
export function isEmpty(dir) {
    if (!fse.existsSync(dir))
        return true;
    const files = fse
        .readdirSync(dir)
        .filter((f) => ![".DS_Store", "Thumbs.db"].includes(f));
    return files.length === 0;
}
export function today() {
    return new Date().toISOString().slice(0, 10);
}
export function formatDuration(ms) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
export function renderSummaryBox(fields) {
    const keys = Object.keys(fields);
    const maxKeyLen = Math.max(...keys.map((k) => k.length));
    const lines = keys.map(k => {
        const pad = " ".repeat(maxKeyLen - k.length);
        return `│   ${pc.dim(k)}${pad}   ${pc.bold(fields[k])}`;
    });
    // Calculate inner width based on un-styled text length
    // The un-styled length of the line is: 4 + k.length + pad.length + 3 + fields[k].length = maxKeyLen + 7 + fields[k].length
    const maxLineLen = Math.max(...keys.map(k => maxKeyLen + 7 + fields[k].length));
    const innerWidth = Math.max(maxLineLen + 3, 40); // Minimum 40 chars width, +3 for right padding
    const top = `┌${"─".repeat(innerWidth)}┐`;
    const bottom = `└${"─".repeat(innerWidth)}┘`;
    const empty = `│${" ".repeat(innerWidth)}│`;
    const formattedLines = keys.map(k => {
        const pad = " ".repeat(maxKeyLen - k.length);
        const textPart = `   ${k}${pad}   ${fields[k]}`;
        const styledPart = `   ${pc.dim(k)}${pad}   ${pc.bold(fields[k])}`;
        const rightPad = " ".repeat(innerWidth - textPart.length);
        return `│${styledPart}${rightPad}│`;
    });
    return [
        "",
        top,
        empty,
        ...formattedLines,
        empty,
        bottom
    ].join("\n");
}
//# sourceMappingURL=utils.js.map