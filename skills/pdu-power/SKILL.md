---
name: pdu-power
description: Map device PSUs to PDU outlets, estimate per-phase and per-rack load, and flag redundancy or overload. Use for rack power, GPU server feeds, or a NetBox power export.
---

Use `power_analyze` with racks, PDUs (phases, circuits, outlets, ratings), and devices (PSUs and optional `specId` or `loadWatts`). Use `power_pull_pdu` only for a read-only Redfish or SNMP pull. Use `cmdb_preview` with target `netbox` when the user wants power ports, outlets, and feeds exported.

Rules:

- Operator `loadWatts` overrides the spec. Otherwise use `systemPlanningWatts` from the catalog. Do not turn a PSU option wattage into system load.
- Leave `includeComponentTdp` false unless the user asks. When it is true, the result is labeled incomplete and is accelerator TDP only.
- Normal load splits watts across distinct feeds, then across the distinct phases on that feed. Failover places the full device watts on each feed, then splits across that feed's phases. Say that this is an assumption, not a measurement.
- Report findings by code: `unmapped-psu`, `unknown-outlet`, `single-psu`, `loss-of-feed-diversity`, `single-pdu`, `single-phase`, `phase-overload`, `phase-overload-failover`, `pdu-overload-failover`, `load-unknown`, `accelerator-tdp-only`.
- SNMP uses the `snmp_community` plugin setting. Do not pass a community string as a tool argument and do not default it.
- A phase capacity taken from volts times amps is VA. Do not apply a power factor that the user did not supply.
