import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCatalog } from "../src/specs/load.js";
import { compareProducts, getProduct, planningWatts, searchProducts } from "../src/specs/query.js";
import { testConfig } from "./helpers.js";

test("starter catalog loads and stays sourced", () => {
  const catalog = loadCatalog(testConfig().specDir);
  assert.ok(catalog.products.length >= 12);
  const ai = searchProducts(catalog, { aiFactory: true, query: "xe9680" });
  assert.equal(ai.length, 1);
  assert.equal(ai[0].id, "dell-poweredge-xe9680");
  const missing = searchProducts(catalog, { query: "synergy 480" });
  assert.equal(missing.length, 0);
  const coverage = catalog.coverage.find((entry) => entry.family === "HPE Synergy");
  assert.equal(coverage?.status, "not-in-starter");
});

test("verified planning watts come from the F710 sheet and GPU TDPs are not system load", () => {
  const catalog = loadCatalog(testConfig().specDir);
  const f710 = getProduct(catalog, "dell-powerscale-f710");
  assert.ok(f710);
  assert.equal(planningWatts(f710).watts, 887);
  const xe = getProduct(catalog, "XE9680");
  assert.ok(xe);
  assert.equal(planningWatts(xe).watts, null);
  assert.equal(xe.firmwareBaseline.components.length, 0);
  const compared = compareProducts(catalog, ["hpe-proliant-dl380-gen11", "dell-poweredge-r760"]);
  assert.equal(compared.products.length, 2);
  assert.equal(compared.products[0].found, true);
});

test("XD685 stays unverified and Cray is not aliased to it", () => {
  const catalog = loadCatalog(testConfig().specDir);
  const xd = getProduct(catalog, "hpe-proliant-xd685");
  assert.ok(xd);
  assert.equal(xd.formFactor?.verification, "unverified");
  const cray = catalog.coverage.find((entry) => entry.family === "HPE Cray XD");
  assert.equal(cray?.status, "not-in-starter");
  assert.equal(catalog.solutions.every((solution) => solution.notAVendorDocument), true);
});
