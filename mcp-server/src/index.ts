#!/usr/bin/env node
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { guardedClient, nodeHttpClient } from "./http.js";
import { createServer } from "./server.js";
import { fetchSource, loadSources, mergeFetch, readCache, writeCache } from "./updates/fetch.js";
import { exportBundle, verifyBundle } from "./updates/bundle.js";
import { importLocalCatalog } from "./updates/import-local.js";
import { RateLimiter } from "./updates/robots.js";

const command = process.argv[2];

if (!command || command === "--stdio") {
  const server = createServer();
  await server.connect(new StdioServerTransport());
} else if (command === "fetch") {
  const config = loadConfig();
  const http = guardedClient(config, nodeHttpClient());
  const sourceId = flag("--source");
  const sources = loadSources(path.join(path.dirname(config.cachePath), "sources.json")).filter((source) => !sourceId || source.id === sourceId);
  const limiter = new RateLimiter(config.fetchMinIntervalMs);
  let cache = readCache(config.cachePath);
  for (const source of sources) {
    const result = await fetchSource({ config, http, source, limiter });
    cache = mergeFetch(cache, result);
    process.stdout.write(`${result.sourceId}\t${result.status}\t${result.records.length}\t${result.reason}\n`);
  }
  writeCache(config.cachePath, cache);
} else if (command === "import-local") {
  const config = loadConfig();
  const filePath = required("--file");
  const vendor = required("--vendor");
  const sourceId = required("--source-id");
  const result = importLocalCatalog({ filePath, vendor, sourceId, mirrorDir: config.mirrorDir });
  writeCache(config.cachePath, mergeFetch(readCache(config.cachePath), result));
  process.stdout.write(`${result.status}\t${result.records.length}\t${result.reason}\n`);
} else if (command === "bundle") {
  const config = loadConfig();
  const outDir = required("--out");
  const cache = readCache(config.cachePath);
  const manifest = exportBundle({
    pluginRoot: config.pluginRoot,
    outDir,
    signingKeyPem: config.signingKeyPem,
    unavailableSources: cache.fetches.filter((fetch) => fetch.status === "unavailable").map((fetch) => ({ id: fetch.sourceId, url: fetch.url, reason: fetch.reason })),
  });
  process.stdout.write(`wrote ${manifest.files.length} files signature=${manifest.signature} ${outDir}\n`);
} else if (command === "verify") {
  const config = loadConfig();
  const bundleDir = required("--bundle");
  const result = verifyBundle(bundleDir, config.publicKeyPem);
  process.stdout.write(`${result.message}\n`);
  if (!result.checksumsOk || result.signature === "invalid" || result.signature === "unchecked") process.exitCode = 1;
} else {
  process.stderr.write(`hw-spec-locator commands: fetch, import-local, bundle, verify\n`);
  process.exitCode = 2;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = flag(name);
  if (!value) {
    process.stderr.write(`Missing ${name}\n`);
    process.exit(2);
  }
  return value;
}
