#!/usr/bin/env node
import path from 'node:path';
import { S as StdioServerTransport } from './vendor/modelcontextprotocol-sdk.js';
import { l as loadConfig } from './app/config.js';
import { g as guardedClient, n as nodeHttpClient } from './app/http.js';
import { c as createServer } from './app/server.js';
import { l as loadSources, r as readCache, f as fetchSource, m as mergeFetch, w as writeCache } from './app/updates/fetch.js';
import { e as exportBundle, v as verifyBundle } from './app/updates/bundle.js';
import { i as importLocalCatalog } from './app/updates/import-local.js';
import { R as RateLimiter } from './app/updates/robots.js';
import 'node:process';
import './vendor/zod.js';
import './vendor/zod-to-json-schema.js';
import './vendor/ajv.js';
import './vendor/fast-deep-equal.js';
import './vendor/json-schema-traverse.js';
import './vendor/fast-uri.js';
import './vendor/ajv-formats.js';
import 'node:fs';
import 'node:url';
import 'node:http';
import 'node:https';
import 'node:zlib';
import './app/cmdb/normalize.js';
import './app/specs/query.js';
import './app/specs/load.js';
import './app/specs/integrity.js';
import './app/cmdb/targets.js';
import './app/cmdb/model.js';
import './app/integrations/ome.js';
import './app/integrations/oneview.js';
import './app/net/apply.js';
import './app/net/cabling.js';
import './app/net/diff.js';
import './app/net/render.js';
import './app/net/validate.js';
import './app/power/analyze.js';
import './app/power/model.js';
import './app/power/pdu.js';
import './app/power/snmp.js';
import 'node:dgram';
import './app/redfish/client.js';
import './app/tool-result.js';
import 'node:crypto';
import './app/updates/parse.js';
import './vendor/fast-xml-parser.js';
import './vendor/xml-naming.js';
import './vendor/strnum.js';
import './vendor/anynum.js';
import './vendor/path-expression-matcher.js';
import './vendor/is-unsafe.js';
import './vendor/nodable-entities.js';

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
    process.stdout.write(`${result.sourceId}	${result.status}	${result.records.length}	${result.reason}
`);
  }
  writeCache(config.cachePath, cache);
} else if (command === "import-local") {
  const config = loadConfig();
  const filePath = required("--file");
  const vendor = required("--vendor");
  const sourceId = required("--source-id");
  const result = importLocalCatalog({ filePath, vendor, sourceId, mirrorDir: config.mirrorDir });
  writeCache(config.cachePath, mergeFetch(readCache(config.cachePath), result));
  process.stdout.write(`${result.status}	${result.records.length}	${result.reason}
`);
} else if (command === "bundle") {
  const config = loadConfig();
  const outDir = required("--out");
  const cache = readCache(config.cachePath);
  const manifest = exportBundle({
    pluginRoot: config.pluginRoot,
    outDir,
    signingKeyPem: config.signingKeyPem,
    unavailableSources: cache.fetches.filter((fetch) => fetch.status === "unavailable").map((fetch) => ({ id: fetch.sourceId, url: fetch.url, reason: fetch.reason }))
  });
  process.stdout.write(`wrote ${manifest.files.length} files signature=${manifest.signature} ${outDir}
`);
} else if (command === "verify") {
  const config = loadConfig();
  const bundleDir = required("--bundle");
  const result = verifyBundle(bundleDir, config.publicKeyPem);
  process.stdout.write(`${result.message}
`);
  if (!result.checksumsOk || result.signature === "invalid" || result.signature === "unchecked") process.exitCode = 1;
} else {
  process.stderr.write(`hw-spec-locator commands: fetch, import-local, bundle, verify
`);
  process.exitCode = 2;
}
function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : void 0;
}
function required(name) {
  const value = flag(name);
  if (!value) {
    process.stderr.write(`Missing ${name}
`);
    process.exit(2);
  }
  return value;
}
