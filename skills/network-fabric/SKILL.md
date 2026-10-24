---
name: network-fabric
description: Generate, validate, and diff switch configurations for HPE Aruba AOS-CX, Dell OS10, Enterprise SONiC, Cumulus NVUE, and Junos, including AI fabric and leaf-spine intent. Use for VLANs, LAGs, VSX, VLT, cabling maps, or a config review.
---

Use `net_validate` before `net_generate`. Use `net_map_cabling` for server NIC to leaf port maps. Use `net_diff` when the user supplies a before and after. Use `net_apply` only when the user explicitly asks to push pinned commands.

Rules:

- Pinned output covers hostname, VLAN, interface mode, LAG, VSX, and VLT basics for the selected NOS.
- RoCEv2 PFC, ECN, and DCQCN text, and BGP EVPN/VXLAN CLI, are marked UNVERIFIED. Show that block as a review draft. Do not tell the user it is vendor-certified syntax.
- `net_apply` sends pinned commands only, and only when `HWOPS_ALLOW_WRITE=true` and `confirm` matches. It never sends the unverified block.
- A model warning such as Z9864F-ON with OS10 means the starter spec does not list that NOS. It is not a citation that the NOS is unsupported.
- Rail cabling is a planning heuristic: leaves sorted by name, NIC order as the rail unless a NIC sets `rail`. It is not a vendor bill of materials.
- Designs: `access-vlan`, `ai-rail`, `evpn-vxlan`, `storage`, `oob`.
