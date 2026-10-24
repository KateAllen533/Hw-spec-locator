import type { HttpClient, HttpRequest, HttpResponse } from "../src/http.js";
import { loadConfig, type HwopsConfig } from "../src/config.js";

export function testConfig(overrides: Partial<HwopsConfig> = {}): HwopsConfig {
  return { ...loadConfig({ ...process.env, HWOPS_ALLOW_WRITE: "", HWOPS_OFFLINE: "" }), allowWrite: false, offline: false, ...overrides };
}

export function mockHttp(handler: (req: HttpRequest) => { status?: number; headers?: Record<string, string>; body?: unknown }): HttpClient {
  return async (req) => {
    const result = handler(req);
    const body = result.body === undefined ? Buffer.from("") : Buffer.isBuffer(result.body) ? result.body : Buffer.from(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
    const response: HttpResponse = {
      status: result.status ?? 200,
      headers: Object.fromEntries(Object.entries(result.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])),
      body,
    };
    return response;
  };
}
