import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseByContent } from "./parse.js";
import type { FetchSourceResult, UpdateRecord } from "./fetch.js";

export function importLocalCatalog(options: {
  filePath: string;
  vendor: string;
  sourceId: string;
  mirrorDir: string;
  now?: string;
}): FetchSourceResult {
  const retrievedAt = options.now ?? new Date().toISOString();
  const body = readFileSync(options.filePath);
  const parsed = parseByContent(body);
  const destination = path.join(options.mirrorDir, options.vendor.toLowerCase(), "catalog", path.basename(options.filePath));
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(options.filePath, destination);
  const mtime = statSync(options.filePath).mtime.toISOString();
  if (parsed.records.length === 0) {
    return {
      sourceId: options.sourceId,
      url: `file://${path.resolve(options.filePath)}`,
      status: "unavailable",
      reason: `Local file was copied to the mirror but parser ${parsed.parser} recognized no version records. No versions were invented. File mtime ${mtime}.`,
      retrievedAt,
      records: [],
    };
  }
  const records: UpdateRecord[] = parsed.records.map((record) => ({
    ...record,
    vendor: options.vendor,
    sourceId: options.sourceId,
    sourceUrl: `file://${path.resolve(options.filePath)}`,
    retrievedAt,
  }));
  return {
    sourceId: options.sourceId,
    url: `file://${path.resolve(options.filePath)}`,
    status: "fetched",
    reason: `Imported ${records.length} records from a local file with ${parsed.parser}. The file was not downloaded by this tool. File mtime ${mtime}.`,
    retrievedAt,
    records,
  };
}
