import assert from "node:assert/strict";
import { test } from "node:test";
import { fromRedfish, toCsv } from "../src/cmdb/normalize.js";
import { netboxPlan, serviceNowPayload, serviceNowTable, syncServiceNow } from "../src/cmdb/targets.js";
import { WriteDisabledError } from "../src/config.js";
import { listOmeDevices } from "../src/integrations/ome.js";
import { listOneViewHardware } from "../src/integrations/oneview.js";
import { RedfishClient } from "../src/redfish/client.js";
import { mockHttp, testConfig } from "./helpers.js";

const ilo = {
  "/redfish/v1/": { body: { RedfishVersion: "1.15.0", Systems: { "@odata.id": "/redfish/v1/Systems" } } },
  "/redfish/v1/Systems": { body: { Members: [{ "@odata.id": "/redfish/v1/Systems/1" }] } },
  "/redfish/v1/Systems/1": {
    body: {
      Id: "1",
      Manufacturer: "HPE",
      Model: "ProLiant DL380 Gen11",
      SerialNumber: "MXQ123",
      SKU: "P12345-B21",
      BiosVersion: "U54 v2.10",
      PowerState: "On",
      Status: { Health: "Warning", State: "Enabled" },
      ProcessorSummary: { Count: 2, Model: "Intel Xeon" },
      MemorySummary: { TotalSystemMemoryGiB: 512 },
      Processors: { "@odata.id": "/redfish/v1/Systems/1/Processors" },
      Memory: { "@odata.id": "/redfish/v1/Systems/1/Memory" },
      Storage: { "@odata.id": "/redfish/v1/Systems/1/Storage" },
      EthernetInterfaces: { "@odata.id": "/redfish/v1/Systems/1/EthernetInterfaces" },
    },
  },
  "/redfish/v1/Systems/1/Processors": {
    body: { Members: [{ "@odata.id": "/redfish/v1/Systems/1/Processors/1" }] },
  },
  "/redfish/v1/Systems/1/Processors/1": { body: { Id: "1", Model: "Xeon Gold 6544Y", TotalCores: 16, Status: { Health: "OK" } } },
  "/redfish/v1/Systems/1/Memory": { body: { Members: [{ Id: "DIMM1", CapacityMiB: 65536, MemoryDeviceType: "DDR5", OperatingSpeedMhz: 4800, Status: { Health: "OK" } }] } },
  "/redfish/v1/Systems/1/Storage": { body: { Members: [{ "@odata.id": "/redfish/v1/Systems/1/Storage/1" }] } },
  "/redfish/v1/Systems/1/Storage/1": {
    body: { Id: "1", Name: "HPE SR", Drives: { "@odata.id": "/redfish/v1/Systems/1/Storage/1/Drives" } },
  },
  "/redfish/v1/Systems/1/Storage/1/Drives": {
    body: { Members: [{ Id: "Disk.1", CapacityBytes: 1920383410176, MediaType: "SSD", Protocol: "NVMe", SerialNumber: "DRV1", Status: { Health: "OK" } }] },
  },
  "/redfish/v1/Systems/1/EthernetInterfaces": {
    body: { Members: [{ Id: "1", MACAddress: "00:11:22:33:44:55", SpeedMbps: 25000, Status: { Health: "OK" } }] },
  },
  "/redfish/v1/UpdateService/FirmwareInventory": {
    body: { Members: [{ Id: "iLO", Name: "iLO 6", Version: "1.60", Updateable: true }] },
  },
};

test("iLO Redfish inventory normalizes into a CMDB server", async () => {
  const http = mockHttp((req) => {
    const path = new URL(req.url).pathname;
    if (req.method === "POST" && path.endsWith("/Sessions")) {
      return { status: 201, headers: { "x-auth-token": "token-1" }, body: {} };
    }
    const route = ilo[path as keyof typeof ilo];
    if (!route) return { status: 404, body: { missing: path } };
    return route;
  });
  const config = testConfig({ redfishUser: "ops", redfishAuth: "secret" });
  const client = new RedfishClient(http, "https://ilo.example", "ops", "secret", config);
  await client.login();
  const collected = await client.collect();
  assert.equal(collected.systems.length, 1);
  const system = collected.systems[0];
  assert.equal(system.vendor, "HPE");
  assert.equal(system.manager, "ilo");
  assert.equal(system.serial, "MXQ123");
  assert.equal(system.health, "Warning");
  assert.equal(system.processors[0].cores, 16);
  assert.equal(system.memory[0].capacityMiB, 65536);
  assert.equal(system.storage[0].drives[0].protocol, "NVMe");
  assert.equal(system.ethernet[0].mac, "00:11:22:33:44:55");
  assert.equal(system.firmware[0].version, "1.60");
  const asset = fromRedfish(system, { managementIp: "10.0.0.10" });
  assert.equal(asset.category, "server");
  assert.equal(serviceNowTable(asset), "cmdb_ci_server");
  assert.equal(serviceNowPayload(asset).serial_number, "MXQ123");
  assert.match(toCsv([asset]), /MXQ123/);
  const netbox = netboxPlan(asset);
  assert.equal(netbox.device.serial, "MXQ123");
  assert.equal(netbox.interfaces[0].mac_address, "00:11:22:33:44:55");
});

test("iDRAC system id is discovered from the collection", async () => {
  const http = mockHttp((req) => {
    const path = new URL(req.url).pathname;
    if (path === "/redfish/v1/") return { body: { Systems: { "@odata.id": "/redfish/v1/Systems" } } };
    if (path === "/redfish/v1/Systems") return { body: { Members: [{ "@odata.id": "/redfish/v1/Systems/System.Embedded.1" }] } };
    if (path.endsWith("System.Embedded.1")) {
      return { body: { Id: "System.Embedded.1", Manufacturer: "Dell Inc.", Model: "PowerEdge R760", SerialNumber: "SERVICETAG", Status: { Health: "OK" }, Oem: { Dell: { DellSystem: {} } } } };
    }
    if (path.includes("FirmwareInventory")) return { body: { Members: [{ Id: "BIOS", Name: "BIOS", Version: "1.12.1" }] } };
    return { body: { Members: [] } };
  });
  const config = testConfig({ redfishUser: "root", redfishAuth: "secret" });
  const client = new RedfishClient(http, "https://idrac.example", "root", "secret", config);
  const collected = await client.collect();
  assert.equal(collected.systems[0].vendor, "Dell");
  assert.equal(collected.systems[0].manager, "idrac");
  assert.equal(collected.systems[0].biosVersion, undefined);
  assert.equal(collected.systems[0].firmware[0].version, "1.12.1");
});

test("OneView and OpenManage Enterprise use mocked sessions", async () => {
  const http = mockHttp((req) => {
    const path = new URL(req.url).pathname;
    if (path === "/rest/version") return { body: { currentVersion: 6400 } };
    if (path === "/rest/login-sessions") return { body: { sessionID: "ov-session" } };
    if (path === "/rest/server-hardware") {
      return { body: { members: [{ name: "bay1", model: "Synergy 480 Gen11", serialNumber: "SYN1", status: "OK", memoryMb: 262144, processorCount: 2 }] } };
    }
    if (path === "/api/SessionService/Sessions") return { status: 201, headers: { "x-auth-token": "ome-token" }, body: {} };
    if (path === "/api/DeviceService/Devices") {
      return { body: { value: [{ Id: 10, DeviceName: "r760-a", Model: "PowerEdge R760", Identifier: "ABC1234", Type: 1000, Status: 1000 }] } };
    }
    return { status: 404, body: {} };
  });
  const oneview = await listOneViewHardware(testConfig({ oneviewHost: "oneview.example", oneviewUser: "a", oneviewAuth: "b" }), http, "oneview.example");
  assert.equal(oneview.apiVersion, "6400");
  assert.equal(oneview.servers[0].serialNumber, "SYN1");
  const ome = await listOmeDevices(testConfig({ omeHost: "ome.example", omeUser: "a", omeAuth: "b" }), http);
  assert.equal(ome.devices[0].identifier, "ABC1234");
});

test("CMDB sync is refused unless the write gate is open", async () => {
  const asset = fromRedfish(
    {
      vendor: "Dell",
      manager: "idrac",
      id: "1",
      serial: "ABC",
      model: "PowerEdge R760",
      processors: [],
      memory: [],
      storage: [],
      ethernet: [],
      firmware: [],
    },
    {},
  );
  const http = mockHttp(() => {
    throw new Error("network should not be called");
  });
  await assert.rejects(() => syncServiceNow(testConfig({ allowWrite: false }), http, [asset], "APPLY"), WriteDisabledError);
  await assert.rejects(
    () => syncServiceNow(testConfig({ allowWrite: true, snowInstance: "https://example.service-now.com", snowBearer: "t" }), http, [asset], "NOPE"),
    /confirm/i,
  );
});

test("ServiceNow sync patches an existing serial", async () => {
  const calls: string[] = [];
  const http = mockHttp((req) => {
    calls.push(`${req.method ?? "GET"} ${new URL(req.url).pathname}`);
    if ((req.method ?? "GET") === "GET") return { body: { result: [{ sys_id: "sys1" }] } };
    return { body: { result: { sys_id: "sys1" } } };
  });
  const asset = fromRedfish(
    { vendor: "HPE", manager: "ilo", id: "1", serial: "MXQ123", model: "ProLiant DL380 Gen11", processors: [], memory: [], storage: [], ethernet: [], firmware: [] },
    {},
  );
  const result = await syncServiceNow(
    testConfig({ allowWrite: true, snowInstance: "https://example.service-now.com", snowBearer: "token" }),
    http,
    [asset],
    "APPLY",
  );
  assert.equal(result.results[0].action, "update");
  assert.ok(calls.some((call) => call.startsWith("PATCH")));
});
