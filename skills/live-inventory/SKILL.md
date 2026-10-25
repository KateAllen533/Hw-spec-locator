---
name: live-inventory
description: Read live HPE iLO, Dell iDRAC, HPE OneView, and Dell OpenManage Enterprise inventory. Use for serials, health, firmware inventory, or a hardware list from a management endpoint.
---

Use `redfish_inventory` for a baseboard management controller, `oneview_inventory` for HPE OneView, and `ome_inventory` for Dell OpenManage Enterprise.

Rules:

- These tools are read-only. Do not ask the user to paste a password into the chat. Credentials come from the plugin settings `redfish_username`, `redfish_password`, `oneview_username`, `oneview_password`, `ome_username`, and `ome_password`.
- Pass the host. Do not pass usernames or passwords as tool arguments.
- If the tool returns an error about a missing plugin setting, tell the user which setting to fill in and stop.
- Report the service, model, serial, health, and firmware entries that the tool actually returned. Do not add components that were not in the payload.
- Offline mode blocks these calls unless the host is listed in `HWOPS_OFFLINE_ALLOW_HOSTS`.
