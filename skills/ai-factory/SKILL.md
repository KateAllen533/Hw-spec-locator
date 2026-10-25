---
name: ai-factory
description: Look up Dell AI Factory and HPE Private Cloud AI components that are actually in this catalog, including GPU servers, PowerScale, Alletra MP, and AI switches. Use when the user asks for an AI Factory or Private Cloud AI stack.
---

Start with `spec_coverage` and `spec_search`. The starter catalog includes Dell PowerEdge XE9680, XE8640, and XE9712, PowerScale F710, and PowerSwitch Z9864F-ON, plus HPE ProLiant DL380a Gen12, DL384 Gen12, ProLiant Compute XD685, Alletra Storage MP B10000, and Aruba CX 9300-32D.

Rules:

- Treat `data/specs/solutions.json` as a plugin index. Do not present it as a Dell or HPE reference architecture.
- XD685 values are unverified. Cray XD and Juniper platform specs are not in the starter catalog. Junos templates still exist in `net_generate`.
- Do not invent a recommended firmware or driver baseline. `spec_baselines` reports retrieved records only, and the starter baselines are unavailable.
- GPU option names and TDPs are component options. They are not the server nameplate. XE9712 rack-shelf wattage is not sled wattage.
- For the GPU backend, use the `network-fabric` skill: rail-optimized cabling, RoCEv2 parameters as unverified CLI, and separate frontend, storage, and out-of-band networks.
