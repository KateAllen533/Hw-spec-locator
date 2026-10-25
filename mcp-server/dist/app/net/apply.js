import { b as assertWriteAllowed, a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';
import { m as managementBase } from '../remote/base-url.js';
import { b as bearerAuthorization, s as switchLoginBody, S as SESSION_COOKIE } from './switch-auth.js';

async function applyRendered(options) {
  assertWriteAllowed(options.config, options.confirm, "switch configuration apply");
  if (options.rendered.unverified.length > 0 && !options.config.allowUnverifiedApply) {
    throw new Error(
      "Refusing to apply because the draft contains UNVERIFIED syntax. Apply sends pinned commands only when the unverified list is empty, or turn HWOPS_ALLOW_UNVERIFIED_APPLY to true to send pinned commands anyway. Unverified text is never sent."
    );
  }
  if (options.rendered.pinnedCommands.length === 0) throw new Error("Nothing pinned to apply.");
  if (options.transport === "aos-cx-cli") {
    if (options.rendered.nos !== "aos-cx") throw new Error("aos-cx-cli transport only accepts an aos-cx draft.");
    if (!options.host) throw new Error("host is required for aos-cx-cli.");
    if (!options.config.switchUser || !options.config.switchAuth) {
      throw new Error("Provide the switch_username and switch_password plugin settings.");
    }
    return applyAosCx(options.config, options.http, options.host, options.rendered.pinnedCommands);
  }
  if (!options.config.switchApplyUrl || !options.config.switchBearer) {
    throw new Error("generic-https requires the switch_apply_url and switch_token plugin settings.");
  }
  assertOnline(options.config, options.config.switchApplyUrl);
  const res = await options.http({
    method: "POST",
    url: options.config.switchApplyUrl,
    headers: {
      authorization: bearerAuthorization(options.config.switchBearer),
      "content-type": "text/plain"
    },
    body: options.rendered.pinnedCommands.join("\n"),
    tlsVerify: options.config.tlsVerify
  });
  if (res.status >= 400) throw new Error(`Switch apply URL returned HTTP ${res.status}.`);
  return { transport: "generic-https", status: res.status, pinnedCommandCount: options.rendered.pinnedCommands.length };
}
async function applyAosCx(config, http, host, commands) {
  const base = managementBase(host);
  const version = config.aoscxApiVersion;
  const loginUrl = `${base}/rest/${version}/login`;
  assertOnline(config, loginUrl);
  const login = await http({
    method: "POST",
    url: loginUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: switchLoginBody(config.switchUser ?? "", config.switchAuth ?? ""),
    tlsVerify: config.tlsVerify
  });
  if (login.status >= 400) throw new Error(`AOS-CX login returned HTTP ${login.status}.`);
  const cookie = login.headers[SESSION_COOKIE];
  if (!cookie) throw new Error("AOS-CX login did not return a session cookie.");
  const results = [];
  for (const command of commands) {
    const url = `${base}/rest/${version}/cli`;
    const res = await http({
      method: "POST",
      url,
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ cmd: command }),
      tlsVerify: config.tlsVerify
    });
    if (res.status >= 400) throw new Error(`AOS-CX CLI returned HTTP ${res.status} for a pinned command.`);
    results.push({ status: res.status, body: textBody(res).slice(0, 500) });
  }
  return { transport: "aos-cx-cli", apiVersion: version, pinnedCommandCount: commands.length, results };
}

export { applyRendered as a };
