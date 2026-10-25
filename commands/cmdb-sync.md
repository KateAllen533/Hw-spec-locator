---
description: Normalize assets and preview or sync them to ServiceNow, NetBox, CSV, or JSON
argument-hint: "[preview|write-out|sync] [servicenow|netbox|csv|json]"
---

The user wants a CMDB operation: $ARGUMENTS

Follow the cmdb-operations skill. Normalize first. CSV or JSON output and preview are the default. Call `cmdb_sync` only when the argument explicitly says sync and the user has confirmed the write token. Repeat the target system and whether the call was a preview or a write.
