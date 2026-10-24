import { assertOnline, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";

export class OneViewError extends Error {}

export async function listOneViewHardware(config: HwopsConfig, http: HttpClient, host?: string) {
  const base = normalize(host || config.oneviewHost);
  if (!base) throw new OneViewError("Set HWOPS_ONEVIEW_HOST or pass host.");
  if (!config.oneviewUsername || !config.oneviewPassword) {
    throw new OneViewError("Set HWOPS_ONEVIEW_USERNAME and HWOPS_ONEVIEW_PASSWORD.");
  }
  assertOnline(config, `${base}/rest/version`);
  const versionRes = await http({
    url: `${base}/rest/version`,
    headers: { accept: "application/json" },
    tlsVerify: config.tlsVerify,
  });
  if (versionRes.status >= 400) throw new OneViewError(`OneView /rest/version returned HTTP ${versionRes.status}.`);
  const versionBody = JSON.parse(textBody(versionRes)) as { currentVersion?: number | string };
  const apiVersion = config.oneviewApiVersion || (versionBody.currentVersion !== undefined ? String(versionBody.currentVersion) : "");
  if (!apiVersion) throw new OneViewError("OneView /rest/version did not include currentVersion. Set HWOPS_ONEVIEW_API_VERSION.");
  const login = await http({
    method: "POST",
    url: `${base}/rest/login-sessions`,
    headers: { "content-type": "application/json", accept: "application/json", "x-api-version": apiVersion },
    body: JSON.stringify({ userName: config.oneviewUsername, password: config.oneviewPassword }),
    tlsVerify: config.tlsVerify,
  });
  if (login.status >= 400) throw new OneViewError("OneView login failed. Check HWOPS_ONEVIEW_USERNAME and HWOPS_ONEVIEW_PASSWORD.");
  const session = JSON.parse(textBody(login)) as { sessionID?: string };
  if (!session.sessionID) throw new OneViewError("OneView login response did not include sessionID.");
  const hardware = await http({
    url: `${base}/rest/server-hardware`,
    headers: { accept: "application/json", "x-api-version": apiVersion, auth: session.sessionID },
    tlsVerify: config.tlsVerify,
  });
  if (hardware.status >= 400) throw new OneViewError(`OneView server-hardware returned HTTP ${hardware.status}.`);
  const body = JSON.parse(textBody(hardware)) as { members?: Record<string, unknown>[] };
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
      mpHostName: (item.mpHostInfo as { mpHostName?: string } | undefined)?.mpHostName,
      formFactor: item.formFactor,
    })),
  };
}

function normalize(host: string | undefined): string | null {
  if (!host) return null;
  const trimmed = host.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
