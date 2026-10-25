import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { c as checkCatalog } from './integrity.js';

function loadCatalog(specDir) {
  const sources = JSON.parse(readFileSync(path.join(specDir, "sources.json"), "utf8"));
  const productDir = path.join(specDir, "products");
  const products = readdirSync(productDir).filter((name) => name.endsWith(".json")).sort().map((name) => JSON.parse(readFileSync(path.join(productDir, name), "utf8")));
  const coverage = JSON.parse(readFileSync(path.join(specDir, "coverage.json"), "utf8"));
  const solutions = JSON.parse(readFileSync(path.join(specDir, "solutions.json"), "utf8"));
  const catalog = { schemaVersion: "1.0.0", sources, products, coverage, solutions };
  const issues = checkCatalog(catalog);
  if (issues.length > 0) {
    const detail = issues.slice(0, 12).map((issue) => `${issue.productId ?? ""} ${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Spec catalog failed integrity checks (${issues.length}): ${detail}`);
  }
  return catalog;
}
function sourceById(catalog, id) {
  return catalog.sources.find((source) => source.id === id) ?? null;
}

export { loadCatalog as l, sourceById as s };
