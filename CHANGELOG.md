# Changelog

## 1.0.0

First public release of the HW Spec Locator plugin (`hw-spec-locator` on marketplace `kaname-hwops`).

- Sourced starter catalog for Dell AI Factory and HPE Private Cloud AI components, with verification on every claim.
- Read-only Redfish, HPE OneView, and Dell OpenManage Enterprise inventory.
- CMDB normalize, CSV/JSON export, and gated ServiceNow and NetBox sync.
- PDU-to-device mapping, phase and failover load, and NetBox power payloads. SNMP and Redfish PDU reads with no invented telemetry.
- AI fabric drafts for AOS-CX, OS10, Enterprise SONiC, Cumulus NVUE, and Junos. RoCE and EVPN CLI stay unverified and are not applied.
- Firmware metadata fetcher with robots.txt, rate limits, and local catalog import. Dell download catalogs are left unavailable when robots.txt disallows them.
- Checksummed offline bundle with optional signature, plus a local mirror layout.
