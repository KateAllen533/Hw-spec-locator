# Changelog

## 1.1.0

- Ask for iLO, iDRAC, OneView, OpenManage Enterprise, ServiceNow, NetBox, SNMP, switch, and offline-bundle credentials through sensitive plugin settings. The MCP server no longer reads those values from key files on the machine.
- Ship the MCP server as readable JavaScript files, each under 1 MiB, instead of one bundled `dist/index.js`.
- Replace the listing icon with a metadata-free 1024x1024 PNG.

## 1.0.0

First public release of the HW Spec Locator plugin (`hw-spec-locator` on marketplace `kaname-hwops`).

- Sourced starter catalog for Dell AI Factory and HPE Private Cloud AI components, with verification on every claim.
- Read-only Redfish, HPE OneView, and Dell OpenManage Enterprise inventory.
- CMDB normalize, CSV/JSON export, and gated ServiceNow and NetBox sync.
- PDU-to-device mapping, phase and failover load, and NetBox power payloads. SNMP and Redfish PDU reads with no invented telemetry.
- AI fabric drafts for AOS-CX, OS10, Enterprise SONiC, Cumulus NVUE, and Junos. RoCE and EVPN CLI stay unverified and are not applied.
- Firmware metadata fetcher with robots.txt, rate limits, and local catalog import. Dell download catalogs are left unavailable when robots.txt disallows them.
- Checksummed offline bundle with optional signature, plus a local mirror layout.
