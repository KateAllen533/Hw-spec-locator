import { a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';
import { m as managementBase } from '../remote/base-url.js';
import { o as omeLoginBody, O as OME_SESSION_HEADER } from './ome-auth.js';

class OmeError extends Error {
}
async function listOmeDevices(config, http, host) {
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
    tlsVerify: config.tlsVerify
  });
  if (login.status >= 400) throw new OmeError("OpenManage Enterprise login failed. Check the ome_username and ome_password plugin settings.");
  let sessionId = login.headers[OME_SESSION_HEADER];
  if (!sessionId) {
    try {
      const body2 = JSON.parse(textBody(login));
      if (body2.Id) sessionId = body2.Id;
    } catch {
      sessionId = void 0;
    }
  }
  if (!sessionId) throw new OmeError("OpenManage Enterprise login did not return a session id.");
  const devicesRes = await http({
    url: `${base}/api/DeviceService/Devices`,
    headers: { accept: "application/json", [OME_SESSION_HEADER]: sessionId },
    tlsVerify: config.tlsVerify
  });
  if (devicesRes.status >= 400) throw new OmeError(`OpenManage Enterprise devices returned HTTP ${devicesRes.status}.`);
  const body = JSON.parse(textBody(devicesRes));
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
      deviceManagement: item.DeviceManagement
    }))
  };
}
function normalize(host) {
  if (!host) return null;
  return managementBase(host);
}

export { listOmeDevices as l };
