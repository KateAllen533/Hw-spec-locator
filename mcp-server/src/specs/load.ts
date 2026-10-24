import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkCatalog } from "./integrity.js";
import type { Catalog, CoverageEntry, Product, SolutionIndex, SourceRecord } from "./types.js";

export function loadCatalog(specDir: string): Catalog {
  const sources = JSON.parse(readFileSync(path.join(specDir, "sources.json"), "utf8")) as SourceRecord[];
  const productDir = path.join(specDir, "products");
  const products = readdirSync(productDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(productDir, name), "utf8")) as Product);
  const coverage = JSON.parse(readFileSync(path.join(specDir, "coverage.json"), "utf8")) as CoverageEntry[];
  const solutions = JSON.parse(readFileSync(path.join(specDir, "solutions.json"), "utf8")) as SolutionIndex[];
  const catalog: Catalog = { schemaVersion: "1.0.0", sources, products, coverage, solutions };
  const issues = checkCatalog(catalog);
  if (issues.length > 0) {
    const detail = issues
      .slice(0, 12)
      .map((issue) => `${issue.productId ?? ""} ${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Spec catalog failed integrity checks (${issues.length}): ${detail}`);
  }
  return catalog;
}

export function sourceById(catalog: Catalog, id: string) {
  return catalog.sources.find((source) => source.id === id) ?? null;
}
