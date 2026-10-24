import { assertOnline, assertWriteAllowed, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";
import type { RenderedConfig } from "./render.js";

export async function applyRendered(options: {
  config: HwopsConfig;
  http: HttpClient;
  rendered: RenderedConfig;
  confirm: string | undefined;
  transport: "aos-cx-cli" | "generic-https";
  host?: string;
}) {
  assertWriteAllowed(options.config, options.confirm, "switch configuration apply");
  if (options.rendered.unverified.length > 0 && !options.config.allowUnverifiedApply) {
    throw new Error(
      "Refusing to apply because the draft contains UNVERIFIED syntax. Apply sends pinned commands only when the unverified list is empty, or set HWOPS_ALLOW_UNVERIFIED_APPLY=true to send pinned commands anyway. Unverified text is never sent.",
    );
  }
  if (options.rendered.pinnedCommands.length === 0) throw new Error("Nothing pinned to apply.");
  if (options.transport === "aos-cx-cli") {
    if (options.rendered.nos !== "aos-cx") throw new Error("aos-cx-cli transport only accepts an aos-cx draft.");
    if (!options.host) throw new Error("host is required for aos-cx-cli.");
    if (!options.config.switchUsername || !options.config.switchPassword) {
      throw new Error("Set HWOPS_SWITCH_USERNAME and HWOPS_SWITCH_PASSWORD.");
    }
    return applyAosCx(options.config, options.http, options.host, options.rendered.pinnedCommands);
  }
  if (!options.config.switchApplyUrl || !options.config.switchToken) {
    throw new Error("generic-https requires HWOPS_SWITCH_APPLY_URL and HWOPS_SWITCH_TOKEN.");
  }
  assertOnline(options.config, options.config.switchApplyUrl);
  const res = await options.http({
    method: "POST",
    url: options.config.switchApplyUrl,
    headers: {
      authorization: `Bearer ${options.config.switchToken}`,
      "content-type": "text/plain",
    },
    body: options.rendered.pinnedCommands.join("\n"),
    tlsVerify: options.config.tlsVerify,
  });
  if (res.status >= 400) throw new Error(`Switch apply URL returned HTTP ${res.status}.`);
  return { transport: "generic-https", status: res.status, pinnedCommandCount: options.rendered.pinnedCommands.length };
}

async function applyAosCx(config: HwopsConfig, http: HttpClient, host: string, commands: string[]) {
  const base = host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
  const version = config.aoscxApiVersion;
  const loginUrl = `${base}/rest/${version}/login`;
  assertOnline(config, loginUrl);
  const login = await http({
    method: "POST",
    url: loginUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ username: config.switchUsername, password: config.switchPassword }),
    tlsVerify: config.tlsVerify,
  });
  if (login.status >= 400) throw new Error(`AOS-CX login returned HTTP ${login.status}.`);
  const cookie = login.headers["set-cookie"];
  if (!cookie) throw new Error("AOS-CX login did not return a session cookie.");
  const results = [];
  for (const command of commands) {
    const url = `${base}/rest/${version}/cli`;
    const res = await http({
      method: "POST",
      url,
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ cmd: command }),
      tlsVerify: config.tlsVerify,
    });
    if (res.status >= 400) throw new Error(`AOS-CX CLI returned HTTP ${res.status} for a pinned command.`);
    results.push({ status: res.status, body: textBody(res).slice(0, 500) });
  }
  return { transport: "aos-cx-cli", apiVersion: version, pinnedCommandCount: commands.length, results };
}
