import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';
import { p as parseByContent } from './parse.js';
import { r as robotsDecision } from './robots.js';

function emptyCache() {
  return { schemaVersion: "1", records: [], fetches: [] };
}
function readCache(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { schemaVersion: "1", records: parsed.records ?? [], fetches: parsed.fetches ?? [] };
  } catch {
    return emptyCache();
  }
}
function writeCache(file, cache) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cache, null, 2));
}
async function fetchSource(options) {
  const retrievedAt = (options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
  const robotsUrl = new URL(options.source.robotsUrl);
  assertOnline(options.config, options.source.robotsUrl);
  await options.limiter.wait(robotsUrl.host);
  let robots;
  try {
    robots = await options.http({ url: options.source.robotsUrl, headers: { "user-agent": options.config.fetchUserAgent } });
  } catch (error) {
    return {
      sourceId: options.source.id,
      url: options.source.url,
      status: "unavailable",
      reason: `Could not read robots.txt: ${error instanceof Error ? error.message : String(error)}`,
      retrievedAt,
      records: []
    };
  }
  const targetPath = new URL(options.source.url).pathname;
  const decision = robotsDecision(robots.status === 404 ? null : textBody(robots), robots.status, options.config.fetchUserAgent, targetPath);
  if (!decision.allowed) {
    return {
      sourceId: options.source.id,
      url: options.source.url,
      status: "unavailable",
      reason: `${decision.reason} The catalog was not downloaded.`,
      retrievedAt,
      records: []
    };
  }
  assertOnline(options.config, options.source.url);
  await options.limiter.wait(new URL(options.source.url).host);
  const response = await options.http({ url: options.source.url, headers: { "user-agent": options.config.fetchUserAgent } });
  if (response.status >= 400) {
    return {
      sourceId: options.source.id,
      url: options.source.url,
      status: "unavailable",
      reason: `HTTP ${response.status} from ${options.source.url}`,
      retrievedAt,
      records: []
    };
  }
  const sha256 = createHash("sha256").update(response.body).digest("hex");
  if (options.source.parser === "html-links") {
    return {
      sourceId: options.source.id,
      url: options.source.url,
      status: "fetched-unparsed",
      reason: "Index fetched. Package versions are not scraped from HTML. Add a Debian Packages or Dell catalog source, or import a local file.",
      retrievedAt,
      records: [],
      sha256
    };
  }
  const parsed = parseByContent(response.body);
  if (parsed.records.length === 0) {
    return {
      sourceId: options.source.id,
      url: options.source.url,
      status: "fetched-unparsed",
      reason: `Body fetched but parser ${parsed.parser} recognized no version records. No versions were invented.`,
      retrievedAt,
      records: [],
      sha256
    };
  }
  return {
    sourceId: options.source.id,
    url: options.source.url,
    status: "fetched",
    reason: `Parsed ${parsed.records.length} records with ${parsed.parser}.`,
    retrievedAt,
    sha256,
    records: parsed.records.map((record) => ({
      ...record,
      vendor: options.source.vendor,
      sourceId: options.source.id,
      sourceUrl: options.source.url,
      retrievedAt
    }))
  };
}
function mergeFetch(cache, result) {
  const records = cache.records.filter((record) => record.sourceId !== result.sourceId);
  return {
    schemaVersion: "1",
    records: [...records, ...result.records],
    fetches: [...cache.fetches.filter((fetch) => fetch.sourceId !== result.sourceId), { ...result, records: result.records }]
  };
}
function searchUpdates(cache, query) {
  const q = query.trim().toLowerCase();
  if (!q) return cache.records;
  return cache.records.filter(
    (record) => [record.name, record.version, record.productHint, record.componentType, record.vendor, record.sourceId].join(" ").toLowerCase().includes(q)
  );
}
function loadSources(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export { fetchSource as f, loadSources as l, mergeFetch as m, readCache as r, searchUpdates as s, writeCache as w };
