import { assertOnline, assertWriteAllowed, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";
import type { CmdbAsset } from "./model.js";
import { slug } from "./model.js";

export function serviceNowTable(asset: CmdbAsset): string {
  if (asset.category === "storage") return "cmdb_ci_storage_device";
  if (asset.category === "network") return "cmdb_ci_ip_switch";
  if (asset.category === "pdu") return "cmdb_ci_pdu";
  return "cmdb_ci_server";
}

export function serviceNowPayload(asset: CmdbAsset) {
  return {
    name: asset.name,
    serial_number: asset.serial ?? "",
    asset_tag: asset.assetTag ?? "",
    manufacturer: asset.vendor ?? "",
    model_number: asset.model ?? "",
    ip_address: asset.managementIp ?? "",
    short_description: [asset.cpuSummary, asset.memoryMiB ? `${asset.memoryMiB} MiB` : ""].filter(Boolean).join("; "),
    firmware_version: asset.firmware[0]?.version ?? "",
    comments: `hwops source=${asset.source}`,
  };
}

export function netboxPlan(asset: CmdbAsset) {
  const manufacturer = asset.vendor || "Unknown";
  const model = asset.model || "Unknown";
  return {
    manufacturer: { name: manufacturer, slug: slug(manufacturer) },
    device_type: { model, slug: slug(model), manufacturer: slug(manufacturer) },
    device: {
      name: asset.name,
      device_type: { model },
      serial: asset.serial ?? "",
      asset_tag: asset.assetTag ?? null,
      status: "active",
      comments: `hwops source=${asset.source}`,
    },
    interfaces: asset.nics.map((nic) => ({
      device: { name: asset.name },
      name: nic.name,
      mac_address: nic.mac ?? null,
      type: "other",
    })),
    power_ports: asset.powerPorts.map((port) => ({
      device: { name: asset.name },
      name: port.name,
      maximum_draw: port.maximumDrawWatts ?? null,
    })),
  };
}

export async function syncServiceNow(config: HwopsConfig, http: HttpClient, assets: CmdbAsset[], confirm: string | undefined) {
  assertWriteAllowed(config, confirm, "ServiceNow CMDB sync");
  if (!config.snowInstance) throw new Error("Set HWOPS_SNOW_INSTANCE.");
  if (!config.snowToken && !(config.snowUsername && config.snowPassword)) {
    throw new Error("Set HWOPS_SNOW_TOKEN or both HWOPS_SNOW_USERNAME and HWOPS_SNOW_PASSWORD.");
  }
  const base = config.snowInstance.replace(/\/$/, "");
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  if (config.snowToken) headers.authorization = `Bearer ${config.snowToken}`;
  else headers.authorization = `Basic ${Buffer.from(`${config.snowUsername}:${config.snowPassword}`).toString("base64")}`;
  const results = [];
  for (const asset of assets) {
    const table = serviceNowTable(asset);
    const payload = serviceNowPayload(asset);
    assertOnline(config, `${base}/api/now/table/${table}`);
    let sysId: string | undefined;
    if (asset.serial) {
      const query = `${base}/api/now/table/${table}?sysparm_query=${encodeURIComponent(`serial_number=${asset.serial}`)}&sysparm_limit=1&sysparm_fields=sys_id`;
      const existing = await http({ url: query, headers, tlsVerify: config.tlsVerify });
      if (existing.status >= 400) throw new Error(`ServiceNow lookup returned HTTP ${existing.status}.`);
      const body = JSON.parse(textBody(existing)) as { result?: { sys_id?: string }[] };
      sysId = body.result?.[0]?.sys_id;
    }
    if (sysId) {
      const res = await http({
        method: "PATCH",
        url: `${base}/api/now/table/${table}/${sysId}`,
        headers,
        body: JSON.stringify(payload),
        tlsVerify: config.tlsVerify,
      });
      if (res.status >= 400) throw new Error(`ServiceNow update returned HTTP ${res.status}.`);
      results.push({ name: asset.name, table, action: "update", sys_id: sysId });
    } else {
      const res = await http({
        method: "POST",
        url: `${base}/api/now/table/${table}`,
        headers,
        body: JSON.stringify(payload),
        tlsVerify: config.tlsVerify,
      });
      if (res.status >= 400) throw new Error(`ServiceNow create returned HTTP ${res.status}.`);
      const created = JSON.parse(textBody(res)) as { result?: { sys_id?: string } };
      results.push({ name: asset.name, table, action: "create", sys_id: created.result?.sys_id });
    }
  }
  return { target: "servicenow", results };
}

export async function syncNetbox(config: HwopsConfig, http: HttpClient, assets: CmdbAsset[], confirm: string | undefined) {
  assertWriteAllowed(config, confirm, "NetBox sync");
  if (!config.netboxUrl || !config.netboxToken) throw new Error("Set HWOPS_NETBOX_URL and HWOPS_NETBOX_TOKEN.");
  const base = config.netboxUrl.replace(/\/$/, "");
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Token ${config.netboxToken}`,
  };
  const results = [];
  for (const asset of assets) {
    const plan = netboxPlan(asset);
    const manufacturer = await ensure(http, config, headers, `${base}/api/dcim/manufacturers/`, "name", plan.manufacturer.name, plan.manufacturer);
    const deviceType = await ensure(http, config, headers, `${base}/api/dcim/device-types/`, "model", plan.device_type.model, {
      ...plan.device_type,
      manufacturer: manufacturer.id,
    });
    const device = await ensure(http, config, headers, `${base}/api/dcim/devices/`, "name", asset.name, {
      ...plan.device,
      device_type: deviceType.id,
    });
    for (const iface of plan.interfaces) {
      await ensure(http, config, headers, `${base}/api/dcim/interfaces/`, "name", iface.name, { ...iface, device: device.id }, `device_id=${device.id}`);
    }
    for (const port of plan.power_ports) {
      await ensure(http, config, headers, `${base}/api/dcim/power-ports/`, "name", port.name, { ...port, device: device.id }, `device_id=${device.id}`);
    }
    results.push({ name: asset.name, deviceId: device.id, manufacturerId: manufacturer.id, deviceTypeId: deviceType.id });
  }
  return { target: "netbox", results };
}

async function ensure(
  http: HttpClient,
  config: HwopsConfig,
  headers: Record<string, string>,
  collection: string,
  field: string,
  value: string,
  payload: Record<string, unknown>,
  extraQuery = "",
): Promise<{ id: number }> {
  const query = `${collection}?${field}=${encodeURIComponent(value)}${extraQuery ? `&${extraQuery}` : ""}&limit=1`;
  assertOnline(config, query);
  const existing = await http({ url: query, headers, tlsVerify: config.tlsVerify });
  if (existing.status >= 400) throw new Error(`NetBox lookup ${collection} returned HTTP ${existing.status}.`);
  const body = JSON.parse(textBody(existing)) as { results?: { id: number }[] };
  if (body.results && body.results.length > 0) return { id: body.results[0].id };
  const created = await http({
    method: "POST",
    url: collection,
    headers,
    body: JSON.stringify(payload),
    tlsVerify: config.tlsVerify,
  });
  if (created.status >= 400) throw new Error(`NetBox create ${collection} returned HTTP ${created.status}.`);
  const record = JSON.parse(textBody(created)) as { id: number };
  return { id: record.id };
}
