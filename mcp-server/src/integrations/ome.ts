import { assertOnline, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";
import { managementBase } from "../remote/base-url.js";
import { OME_SESSION_HEADER, omeLoginBody } from "./ome-auth.js";

export class OmeError extends Error {}

export async function listOmeDevices(config: HwopsConfig, http: HttpClient, host?: string) {
  const base = normalize(host || config.omeHost);
  if (!base) throw new OmeError("Provide the ome_host plugin setting or pass host.");
  if (!config.omeUser || !config.omeAuth) throw new OmeError("Provide the ome_username and ome_password plugin settings.");
  const sessionUrl = `${base}/api/SessionService/Sessions`;
  assertOnline(config, sessionUrl);
  const login = await http({
    method: "POST",
    url: sessionUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: omeLoginBody(config.omeUser, config.omeAuth),
    tlsVerify: config.tlsVerify,
  });
  if (login.status >= 400) throw new OmeError("OpenManage Enterprise login failed. Check the ome_username and ome_password plugin settings.");
  let sessionId: string | undefined = login.headers[OME_SESSION_HEADER];
  if (!sessionId) {
    try {
      const body = JSON.parse(textBody(login)) as { Id?: string };
      if (body.Id) sessionId = body.Id;
    } catch {
      sessionId = undefined;
    }
  }
  if (!sessionId) throw new OmeError("OpenManage Enterprise login did not return a session id.");
  const devicesRes = await http({
    url: `${base}/api/DeviceService/Devices`,
    headers: { accept: "application/json", [OME_SESSION_HEADER]: sessionId },
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
  return managementBase(host);
}
