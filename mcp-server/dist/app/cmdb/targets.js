import { b as assertWriteAllowed, a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';
import { s as slug } from './model.js';

function serviceNowTable(asset) {
  if (asset.category === "storage") return "cmdb_ci_storage_device";
  if (asset.category === "network") return "cmdb_ci_ip_switch";
  if (asset.category === "pdu") return "cmdb_ci_pdu";
  return "cmdb_ci_server";
}
function serviceNowPayload(asset) {
  return {
    name: asset.name,
    serial_number: asset.serial ?? "",
    asset_tag: asset.assetTag ?? "",
    manufacturer: asset.vendor ?? "",
    model_number: asset.model ?? "",
    ip_address: asset.managementIp ?? "",
    short_description: [asset.cpuSummary, asset.memoryMiB ? `${asset.memoryMiB} MiB` : ""].filter(Boolean).join("; "),
    firmware_version: asset.firmware[0]?.version ?? "",
    comments: `hwops source=${asset.source}`
  };
}
function netboxPlan(asset) {
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
      comments: `hwops source=${asset.source}`
    },
    interfaces: asset.nics.map((nic) => ({
      device: { name: asset.name },
      name: nic.name,
      mac_address: nic.mac ?? null,
      type: "other"
    })),
    power_ports: asset.powerPorts.map((port) => ({
      device: { name: asset.name },
      name: port.name,
      maximum_draw: port.maximumDrawWatts ?? null
    }))
  };
}
async function syncServiceNow(config, http, assets, confirm) {
  assertWriteAllowed(config, confirm, "ServiceNow CMDB sync");
  if (!config.snowInstance) throw new Error("Set the snow_instance plugin setting.");
  if (!config.snowToken && !(config.snowUsername && config.snowPassword)) {
    throw new Error("Set the snow_token plugin setting, or both snow_username and snow_password.");
  }
  const base = config.snowInstance.replace(/\/$/, "");
  const headers = { accept: "application/json", "content-type": "application/json" };
  if (config.snowToken) headers.authorization = `Bearer ${config.snowToken}`;
  else headers.authorization = `Basic ${Buffer.from(`${config.snowUsername}:${config.snowPassword}`).toString("base64")}`;
  const results = [];
  for (const asset of assets) {
    const table = serviceNowTable(asset);
    const payload = serviceNowPayload(asset);
    assertOnline(config, `${base}/api/now/table/${table}`);
    let sysId;
    if (asset.serial) {
      const query = `${base}/api/now/table/${table}?sysparm_query=${encodeURIComponent(`serial_number=${asset.serial}`)}&sysparm_limit=1&sysparm_fields=sys_id`;
      const existing = await http({ url: query, headers, tlsVerify: config.tlsVerify });
      if (existing.status >= 400) throw new Error(`ServiceNow lookup returned HTTP ${existing.status}.`);
      const body = JSON.parse(textBody(existing));
      sysId = body.result?.[0]?.sys_id;
    }
    if (sysId) {
      const res = await http({
        method: "PATCH",
        url: `${base}/api/now/table/${table}/${sysId}`,
        headers,
        body: JSON.stringify(payload),
        tlsVerify: config.tlsVerify
      });
      if (res.status >= 400) throw new Error(`ServiceNow update returned HTTP ${res.status}.`);
      results.push({ name: asset.name, table, action: "update", sys_id: sysId });
    } else {
      const res = await http({
        method: "POST",
        url: `${base}/api/now/table/${table}`,
        headers,
        body: JSON.stringify(payload),
        tlsVerify: config.tlsVerify
      });
      if (res.status >= 400) throw new Error(`ServiceNow create returned HTTP ${res.status}.`);
      const created = JSON.parse(textBody(res));
      results.push({ name: asset.name, table, action: "create", sys_id: created.result?.sys_id });
    }
  }
  return { target: "servicenow", results };
}
async function syncNetbox(config, http, assets, confirm) {
  assertWriteAllowed(config, confirm, "NetBox sync");
  if (!config.netboxUrl || !config.netboxToken) throw new Error("Set the netbox_url and netbox_token plugin settings.");
  const base = config.netboxUrl.replace(/\/$/, "");
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Token ${config.netboxToken}`
  };
  const results = [];
  for (const asset of assets) {
    const plan = netboxPlan(asset);
    const manufacturer = await ensure(http, config, headers, `${base}/api/dcim/manufacturers/`, "name", plan.manufacturer.name, plan.manufacturer);
    const deviceType = await ensure(http, config, headers, `${base}/api/dcim/device-types/`, "model", plan.device_type.model, {
      ...plan.device_type,
      manufacturer: manufacturer.id
    });
    const device = await ensure(http, config, headers, `${base}/api/dcim/devices/`, "name", asset.name, {
      ...plan.device,
      device_type: deviceType.id
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
async function ensure(http, config, headers, collection, field, value, payload, extraQuery = "") {
  const query = `${collection}?${field}=${encodeURIComponent(value)}${extraQuery ? `&${extraQuery}` : ""}&limit=1`;
  assertOnline(config, query);
  const existing = await http({ url: query, headers, tlsVerify: config.tlsVerify });
  if (existing.status >= 400) throw new Error(`NetBox lookup ${collection} returned HTTP ${existing.status}.`);
  const body = JSON.parse(textBody(existing));
  if (body.results && body.results.length > 0) return { id: body.results[0].id };
  const created = await http({
    method: "POST",
    url: collection,
    headers,
    body: JSON.stringify(payload),
    tlsVerify: config.tlsVerify
  });
  if (created.status >= 400) throw new Error(`NetBox create ${collection} returned HTTP ${created.status}.`);
  const record = JSON.parse(textBody(created));
  return { id: record.id };
}

export { serviceNowTable as a, syncServiceNow as b, syncNetbox as c, netboxPlan as n, serviceNowPayload as s };
