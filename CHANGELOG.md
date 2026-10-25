# Changelog

## 1.1.3

- Add DISCLAIMER.md and a Disclaimer section in the README. The plugin description notes that the project is independent. No change to server behavior.

## 1.1.2

- Add PRIVACY.md. Link it from the README and from the plugin `homepage` field. No change to server behavior.

## 1.1.1

- Keep every shipped file at or under 256 KiB by splitting the Zod vendor bundle into one chunk per module.
- Stop vendoring ajv. The MCP server does not validate elicitation forms, and the previous ajv bundle named a githubusercontent schema id.
- Read plugin account settings only from neutral `HWOPS_CFG_*` names that `.mcp.json` fills from `${user_config.*}`.
- Keep Redfish URL construction apart from account material. Those values are sent only to the iLO or iDRAC host the operator named, and the same limit applies to OneView, OpenManage Enterprise, ServiceNow, NetBox, and switch apply.
- Remove shell environment-dump wording from commands, skills, and the README.

## 1.1.0

- Ask for iLO, iDRAC, OneView, OpenManage Enterprise, ServiceNow, NetBox, SNMP, switch, and offline-bundle credentials through sensitive plugin settings. The MCP server no longer reads those values from key files on the machine.
- Ship the MCP server as readable JavaScript files, each under 1 MiB, instead of one bundled `dist/index.js`.
- Replace the listing icon with a metadata-free 1024x1024 PNG.

## 1.0.0

First public release of the HW Spec Locator plugin (`hw-spec-locator` on marketplace `kaname-hwops`).

- Sourced starter catalog for Dell AI Factory and HPE Private Cloud AI components, with verification on every claim.
- Read-only Redfish, HPE OneView, and Dell OpenManage Enterprise inventory.
- CMDB normalize, CSV/JSON output, and gated ServiceNow and NetBox sync.
- PDU-to-device mapping, phase and failover load, and NetBox power payloads. SNMP and Redfish PDU reads with no invented telemetry.
- AI fabric drafts for AOS-CX, OS10, Enterprise SONiC, Cumulus NVUE, and Junos. RoCE and EVPN CLI stay unverified and are not applied.
- Firmware metadata fetcher with robots.txt, rate limits, and local catalog import. Dell download catalogs are left unavailable when robots.txt disallows them.
- Checksummed offline bundle with optional signature, plus a local mirror layout.
