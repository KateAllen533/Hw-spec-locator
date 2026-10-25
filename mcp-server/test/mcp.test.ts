import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { testConfig } from "./helpers.js";

const expected = [
  "spec_search",
  "spec_get",
  "spec_compare",
  "spec_baselines",
  "spec_coverage",
  "redfish_inventory",
  "oneview_inventory",
  "ome_inventory",
  "cmdb_normalize",
  "cmdb_export",
  "cmdb_preview",
  "cmdb_sync",
  "power_analyze",
  "power_pull_pdu",
  "net_generate",
  "net_validate",
  "net_diff",
  "net_map_cabling",
  "net_apply",
  "updates_fetch",
  "updates_search",
  "updates_import_local",
  "updates_bundle_export",
  "updates_bundle_verify",
];

test("MCP server exposes the hardware operations tools", async () => {
  const server = createServer({
    config: testConfig(),
    http: async () => {
      throw new Error("network disabled");
    },
  });
  const client = new Client({ name: "hwops-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...expected].sort());
  await client.close();
});

test("unresolved plugin settings are not treated as credentials", () => {
  const config = loadConfig({
    HWOPS_REDFISH_PASSWORD: "${user_config.redfish_password}",
    HWOPS_NETBOX_TOKEN: "   ",
    HWOPS_BUNDLE_SIGNING_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    HWOPS_BUNDLE_PUBLIC_KEY: "${user_config.bundle_public_key}",
  });
  assert.equal(config.redfishPassword, undefined);
  assert.equal(config.netboxToken, undefined);
  assert.equal(config.publicKeyPem, undefined);
  assert.match(config.signingKeyPem ?? "", /BEGIN PRIVATE KEY/);
});
