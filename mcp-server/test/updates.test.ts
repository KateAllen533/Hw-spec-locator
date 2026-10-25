import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { exportBundle, verifyBundle } from "../src/updates/bundle.js";
import { fetchSource, mergeFetch, readCache, searchUpdates } from "../src/updates/fetch.js";
import { importLocalCatalog } from "../src/updates/import-local.js";
import { parseDebianPackages, parseDellCatalog } from "../src/updates/parse.js";
import { RateLimiter, robotsDecision } from "../src/updates/robots.js";
import { findPluginRoot } from "../src/config.js";
import { mockHttp, testConfig } from "./helpers.js";
import type { UpdateSource } from "../src/updates/fetch.js";

const dellCatalog = `<?xml version="1.0"?>
<Manifest>
  <SoftwareComponent dellVersion="2.4.5" vendorVersion="2.4.5" releaseDate="October 01, 2026" componentType="BIOS" path="FOLDER/BIOS.exe">
    <Name><Display lang="en">PowerEdge R760 BIOS</Display></Name>
    <SupportedDevices>
      <Device><Display lang="en">PowerEdge R760</Display></Device>
    </SupportedDevices>
  </SoftwareComponent>
  <SoftwareComponent componentType="APAC">
    <Name><Display lang="en">Missing version</Display></Name>
  </SoftwareComponent>
</Manifest>`;

test("Dell robots snapshot blocks the catalog and a local import records the real version", () => {
  const robots = readFileSync(path.join(findPluginRoot(), "data/updates/snapshots/2026-10-24/downloads.dell.com-robots.txt"), "utf8");
  const decision = robotsDecision(robots, 200, "hw-spec-locator/1.0.0", "/catalog/Catalog.xml.gz");
  assert.equal(decision.allowed, false);
  const manuals = robotsDecision(robots, 200, "hw-spec-locator/1.0.0", "/manuals/guide.pdf");
  assert.equal(manuals.allowed, true);
  const parsed = parseDellCatalog(dellCatalog);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].version, "2.4.5");
  assert.equal(parsed[0].productHint, "PowerEdge R760");
  const packages = parseDebianPackages("Package: hp-firmware\nVersion: 1.0-1\nFilename: pool/hp-firmware.deb\n\nPackage: incomplete\n");
  assert.equal(packages.length, 1);
});

test("fetcher does not download a disallowed Dell catalog and does not invent versions", async () => {
  let hits = 0;
  const http = mockHttp((req) => {
    hits += 1;
    if (req.url.endsWith("/robots.txt")) {
      return { body: readFileSync(path.join(findPluginRoot(), "data/updates/snapshots/2026-10-24/downloads.dell.com-robots.txt")) };
    }
    throw new Error(`should not fetch ${req.url}`);
  });
  const source: UpdateSource = {
    id: "dell-lc-catalog",
    vendor: "Dell",
    kind: "catalog",
    url: "https://downloads.dell.com/catalog/Catalog.xml.gz",
    robotsUrl: "https://downloads.dell.com/robots.txt",
    parser: "dell-catalog-xml",
  };
  const result = await fetchSource({ config: testConfig(), http, source, limiter: new RateLimiter(0) });
  assert.equal(result.status, "unavailable");
  assert.equal(result.records.length, 0);
  assert.equal(hits, 1);
  const failed = await fetchSource({
    config: testConfig(),
    http: mockHttp(() => {
      throw new Error("network down");
    }),
    source: { ...source, id: "hpe-sdr-index", url: "https://downloads.linux.hpe.com/SDR/index.html", robotsUrl: "https://downloads.linux.hpe.com/robots.txt", parser: "html-links" },
    limiter: new RateLimiter(0),
  });
  assert.equal(failed.status, "unavailable");
  assert.match(failed.reason, /robots.txt/);
});

test("HPE index with no robots file does not scrape versions out of HTML", async () => {
  const http = mockHttp((req) => {
    if (req.url.endsWith("/robots.txt")) return { status: 404, body: "missing" };
    return { body: "<html><a href='spp-gen11/'>spp-gen11</a></html>" };
  });
  const source: UpdateSource = {
    id: "hpe-sdr-index",
    vendor: "HPE",
    kind: "repository-index",
    url: "https://downloads.linux.hpe.com/SDR/index.html",
    robotsUrl: "https://downloads.linux.hpe.com/robots.txt",
    parser: "html-links",
  };
  const result = await fetchSource({ config: testConfig(), http, source, limiter: new RateLimiter(0) });
  assert.equal(result.status, "fetched-unparsed");
  assert.equal(result.records.length, 0);
});

test("local catalog import and signed offline bundle round-trip", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hwops-"));
  const catalogFile = path.join(dir, "Catalog.xml");
  writeFileSync(catalogFile, dellCatalog);
  const imported = importLocalCatalog({ filePath: catalogFile, vendor: "Dell", sourceId: "dell-lc-catalog", mirrorDir: path.join(dir, "mirror") });
  assert.equal(imported.records[0].version, "2.4.5");
  assert.match(imported.records[0].sourceUrl, /^file:/);
  const cache = mergeFetch(readCache(path.join(dir, "missing-cache.json")), imported);
  assert.equal(searchUpdates(cache, "R760")[0].version, "2.4.5");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const bundle = path.join(dir, "bundle");
  const manifest = exportBundle({
    pluginRoot: findPluginRoot(),
    outDir: bundle,
    signingKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    unavailableSources: [{ id: "dell-lc-catalog", reason: "robots" }],
    now: "2026-10-24T00:00:00Z",
  });
  assert.equal(manifest.signature, "present");
  assert.ok(manifest.files.length > 5);
  const verified = verifyBundle(bundle, publicKey.export({ type: "spki", format: "pem" }).toString());
  assert.equal(verified.checksumsOk, true);
  assert.equal(verified.signature, "valid");
  const sums = path.join(bundle, "SHA256SUMS");
  const originalSums = readFileSync(sums, "utf8");
  const flipped = originalSums.replace(/[0-9a-f]/, (digit) => (digit === "0" ? "1" : "0"));
  assert.notEqual(flipped, originalSums);
  writeFileSync(sums, flipped);
  const tampered = verifyBundle(bundle, publicKey.export({ type: "spki", format: "pem" }).toString());
  assert.equal(tampered.checksumsOk, false);
  assert.equal(tampered.signature, "invalid");
});

test("rate limiter spaces requests to one host", async () => {
  let now = 0;
  const delays: number[] = [];
  const limiter = new RateLimiter(
    1000,
    () => now,
    async (ms) => {
      delays.push(ms);
      now += ms;
    },
  );
  await limiter.wait("downloads.dell.com");
  await limiter.wait("downloads.dell.com");
  assert.deepEqual(delays, [1000]);
});
