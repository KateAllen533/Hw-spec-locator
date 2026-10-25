import { a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';

class OneViewError extends Error {
}
async function listOneViewHardware(config, http, host) {
  const base = normalize(host || config.oneviewHost);
  if (!base) throw new OneViewError("Set the oneview_host plugin setting or pass host.");
  if (!config.oneviewUsername || !config.oneviewPassword) {
    throw new OneViewError("Set the oneview_username and oneview_password plugin settings.");
  }
  assertOnline(config, `${base}/rest/version`);
  const versionRes = await http({
    url: `${base}/rest/version`,
    headers: { accept: "application/json" },
    tlsVerify: config.tlsVerify
  });
  if (versionRes.status >= 400) throw new OneViewError(`OneView /rest/version returned HTTP ${versionRes.status}.`);
  const versionBody = JSON.parse(textBody(versionRes));
  const apiVersion = config.oneviewApiVersion || (versionBody.currentVersion !== void 0 ? String(versionBody.currentVersion) : "");
  if (!apiVersion) throw new OneViewError("OneView /rest/version did not include currentVersion. Set the oneview_api_version plugin setting.");
  const login = await http({
    method: "POST",
    url: `${base}/rest/login-sessions`,
    headers: { "content-type": "application/json", accept: "application/json", "x-api-version": apiVersion },
    body: JSON.stringify({ userName: config.oneviewUsername, password: config.oneviewPassword }),
    tlsVerify: config.tlsVerify
  });
  if (login.status >= 400) throw new OneViewError("OneView login failed. Check the oneview_username and oneview_password plugin settings.");
  const session = JSON.parse(textBody(login));
  if (!session.sessionID) throw new OneViewError("OneView login response did not include sessionID.");
  const hardware = await http({
    url: `${base}/rest/server-hardware`,
    headers: { accept: "application/json", "x-api-version": apiVersion, auth: session.sessionID },
    tlsVerify: config.tlsVerify
  });
  if (hardware.status >= 400) throw new OneViewError(`OneView server-hardware returned HTTP ${hardware.status}.`);
  const body = JSON.parse(textBody(hardware));
  const members = body.members ?? [];
  return {
    apiVersion,
    count: members.length,
    servers: members.map((item) => ({
      name: item.name,
      model: item.model ?? item.shortModel,
      serialNumber: item.serialNumber,
      uuid: item.uuid,
      status: item.status,
      powerState: item.powerState,
      position: item.position,
      processorCount: item.processorCount,
      memoryMb: item.memoryMb,
      mpHostName: item.mpHostInfo?.mpHostName,
      formFactor: item.formFactor
    }))
  };
}
function normalize(host) {
  if (!host) return null;
  const trimmed = host.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export { listOneViewHardware as l };
