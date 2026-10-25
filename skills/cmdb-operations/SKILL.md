---
name: cmdb-operations
description: Normalize HPE and Dell assets into a CMDB record and write CSV or JSON, or sync them to ServiceNow or NetBox. Use when the user wants a CMDB row, a preview, or a gated write.
---

Use `cmdb_normalize`, then `cmdb_export` or `cmdb_preview`. Use `cmdb_sync` only after the user explicitly asks to write.

Rules:

- Preview and CSV or JSON output do not call ServiceNow or NetBox.
- `cmdb_sync` is refused unless `HWOPS_ALLOW_WRITE=true` and `confirm` equals `HWOPS_WRITE_CONFIRM` (default `APPLY`). Ask the user to confirm before sending that token.
- Do not put tokens, passwords, or instance URLs into the skill output. Those stay in the plugin settings `snow_instance`, `snow_token`, `snow_username`, `snow_password`, `netbox_url`, and `netbox_token`.
- ServiceNow uses `cmdb_ci_server`, `cmdb_ci_storage_device`, `cmdb_ci_ip_switch`, or `cmdb_ci_pdu`. An existing serial is updated; otherwise a row is created.
- NetBox payloads include device, interface, and power-port fields when the normalized asset has them.
- Say which fields came from a live inventory payload and which came from the spec catalog.
