import { badSync } from "./bad.sync.ts";

if (!badSync.when) throw new Error("missing sync");
