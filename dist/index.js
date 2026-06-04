#!/usr/bin/env node
import { run } from "./prompts.js";
process.on("uncaughtException", (err) => {
    console.error(`Unexpected error: ${err.message}`);
    process.exit(1);
});
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map