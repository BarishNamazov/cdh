import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

export function getPackageRoot(): string {
  return path.resolve(SRC_DIR, "..");
}

export function getBuiltinCatalogRoot(): string {
  return path.join(getPackageRoot(), "catalog");
}

export function getBuiltinBackgroundRoot(): string {
  return path.join(getPackageRoot(), "design", "background");
}
