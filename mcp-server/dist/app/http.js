import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import { a as assertOnline, O as OfflineError, r as readPluginVersion, f as findPluginRoot } from './config.js';

function headerMap(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === void 0) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}
function nodeHttpClient() {
  return (req) => new Promise((resolve, reject) => {
    const url = new URL(req.url);
    const lib = url.protocol === "https:" ? https : http;
    const body = req.body === void 0 ? void 0 : Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const r = lib.request(
      url,
      {
        method: req.method ?? "GET",
        headers: {
          "user-agent": `hw-spec-locator/${readPluginVersion(findPluginRoot())}`,
          accept: "*/*",
          ...body ? { "content-length": String(body.length) } : {},
          ...req.headers
        },
        rejectUnauthorized: req.tlsVerify !== false
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: headerMap(res.headers),
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    r.setTimeout(req.timeoutMs ?? 2e4, () => {
      r.destroy(new Error(`Timed out calling ${req.url}`));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
function decodeBody(res) {
  const encoding = res.headers["content-encoding"] ?? "";
  if (encoding.includes("gzip") || res.body.length >= 2 && res.body[0] === 31 && res.body[1] === 139) {
    try {
      return zlib.gunzipSync(res.body);
    } catch {
      return res.body;
    }
  }
  return res.body;
}
function guardedClient(config, inner) {
  return async (req) => {
    try {
      assertOnline(config, req.url);
    } catch (error) {
      if (error instanceof OfflineError) throw error;
      throw error;
    }
    return inner({ ...req, tlsVerify: req.tlsVerify ?? config.tlsVerify });
  };
}
function textBody(res) {
  return decodeBody(res).toString("utf8");
}

export { decodeBody as d, guardedClient as g, nodeHttpClient as n, textBody as t };
