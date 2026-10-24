---
name: hardware-spec-search
description: Search and compare sourced HPE and Dell hardware specifications, including AI Factory servers, storage, and switches. Use when the user asks for a model, generation, CPU, memory, drive, NIC, GPU, power, or support fact.
---

Use the hwops MCP tools `spec_search`, `spec_get`, `spec_compare`, and `spec_coverage`.

Rules:

- Quote a number only when its claim verification is `verified` or `unverified`, and say which.
- `unavailable` means the value was not captured. Do not fill it in from memory.
- `unverified` means the extract is not confirmed against the publisher. Say that before using the number. ProLiant Compute XD685 claims are unverified.
- Power-supply option watts are not system planning watts. Accelerator TDP is not rack load.
- Firmware baseline components in the starter catalog are empty. Do not invent a BIOS, iLO, iDRAC, or driver version. Use `spec_baselines` and say when the status is unavailable.
- Reference configurations are published option rows, not a certified bill of materials.
- `data/specs/solutions.json` indexes are plugin navigation. They are not Dell AI Factory or HPE Private Cloud AI architectures.
- Cray XD is not the same product as ProLiant Compute XD685. If `spec_coverage` says a family is `not-in-starter`, say so.
