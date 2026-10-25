import { assertOnline, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";

export class OmeError extends Error {}

export async function listOmeDevices(config: HwopsConfig, http: HttpClient, host?: string) {
  const base = normalize(host || config.omeHost);
  if (!base) throw new OmeError("Set the ome_host plugin setting or pass host.");
  if (!config.omeUsername || !config.omePassword) throw new OmeError("Set the ome_username and ome_password plugin settings.");
  const sessionUrl = `${base}/api/SessionService/Sessions`;
  assertOnline(config, sessionUrl);
  const login = await http({
    method: "POST",
    url: sessionUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ UserName: config.omeUsername, Password: config.omePassword, SessionType: "API" }),
    tlsVerify: config.tlsVerify,
  });
  if (login.status >= 400) throw new OmeError("OpenManage Enterprise login failed. Check the ome_username and ome_password plugin settings.");
  let token: string | undefined = login.headers["x-auth-token"];
  if (!token) {
    try {
      const body = JSON.parse(textBody(login)) as { Id?: string };
      if (body.Id) token = body.Id;
    } catch {
      token = undefined;
    }
  }
  if (!token) throw new OmeError("OpenManage Enterprise login did not return an X-Auth-Token.");
  const devicesRes = await http({
    url: `${base}/api/DeviceService/Devices`,
    headers: { accept: "application/json", "x-auth-token": token },
    tlsVerify: config.tlsVerify,
  });
  if (devicesRes.status >= 400) throw new OmeError(`OpenManage Enterprise devices returned HTTP ${devicesRes.status}.`);
  const body = JSON.parse(textBody(devicesRes)) as { value?: Record<string, unknown>[] };
  const value = body.value ?? [];
  return {
    count: value.length,
    devices: value.map((item) => ({
      id: item.Id,
      name: item.DeviceName,
      model: item.Model,
      identifier: item.Identifier,
      type: item.Type,
      status: item.Status,
      powerState: item.PowerState,
      deviceManagement: item.DeviceManagement,
    })),
  };
}

function normalize(host: string | undefined): string | null {
  if (!host) return null;
  const trimmed = host.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
