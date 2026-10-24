import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import zlib from "node:zlib";
import { OfflineError, type HwopsConfig, assertOnline } from "./config.js";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface HttpRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  tlsVerify?: boolean;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

function headerMap(raw: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export function nodeHttpClient(): HttpClient {
  return (req) =>
    new Promise((resolve, reject) => {
      const url = new URL(req.url);
      const lib = url.protocol === "https:" ? https : http;
      const body = req.body === undefined ? undefined : Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
      const r = lib.request(
        url,
        {
          method: req.method ?? "GET",
          headers: {
            "user-agent": "hpe-dell-hwops/1.0.0",
            accept: "*/*",
            ...(body ? { "content-length": String(body.length) } : {}),
            ...req.headers,
          },
          rejectUnauthorized: req.tlsVerify !== false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: headerMap(res.headers),
              body: Buffer.concat(chunks),
            });
          });
        },
      );
      r.setTimeout(req.timeoutMs ?? 20000, () => {
        r.destroy(new Error(`Timed out calling ${req.url}`));
      });
      r.on("error", reject);
      if (body) r.write(body);
      r.end();
    });
}

export async function follow(client: HttpClient, req: HttpRequest, hops = 5): Promise<HttpResponse> {
  const res = await client(req);
  const location = res.headers.location;
  if (location && [301, 302, 303, 307, 308].includes(res.status) && hops > 0) {
    const next = new URL(location, req.url).toString();
    const method = res.status === 303 ? "GET" : (req.method ?? "GET");
    const headers = { ...req.headers };
    if (new URL(next).host !== new URL(req.url).host) {
      delete headers.authorization;
      delete headers.cookie;
      delete headers["x-auth-token"];
    }
    return follow(client, { ...req, url: next, method, headers, body: method === "GET" ? undefined : req.body }, hops - 1);
  }
  return res;
}

export function decodeBody(res: HttpResponse): Buffer {
  const encoding = res.headers["content-encoding"] ?? "";
  if (encoding.includes("gzip") || (res.body.length >= 2 && res.body[0] === 0x1f && res.body[1] === 0x8b)) {
    try {
      return zlib.gunzipSync(res.body);
    } catch {
      return res.body;
    }
  }
  return res.body;
}

export function guardedClient(config: HwopsConfig, inner: HttpClient): HttpClient {
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

export function textBody(res: HttpResponse): string {
  return decodeBody(res).toString("utf8");
}
