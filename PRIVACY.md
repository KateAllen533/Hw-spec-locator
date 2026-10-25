# Privacy

HW Spec Locator runs on your machine. Claude Code starts `mcp-server/dist/index.js` as a local process and talks to it over stdio. The plugin does not listen on a network port, does not send telemetry, and does not send data to the plugin author, the publisher, or Anthropic.

## What stays on your machine

Specification search uses the catalog shipped in this repository. Firmware cache, the local mirror, and an offline bundle are files on your machine (`data/updates/cache.json`, `data/mirror/`, or a directory you choose). Bundle signing material from the plugin settings is used locally. The private key is not copied into the bundle.

## What can leave your machine

Network calls happen only when you use a tool that contacts a host. Account material comes from sensitive plugin settings, which Claude Code stores and passes in through `.mcp.json`. That material is sent only to the host you name:

- HPE iLO or Dell iDRAC, for Redfish inventory and Redfish PDU reads
- HPE OneView
- Dell OpenManage Enterprise
- ServiceNow and NetBox, when you run a gated CMDB sync
- A PDU, as an SNMPv2c read of `sysDescr` and `sysName`
- A switch, when applying pinned commands, or the switch apply URL you configure

The HTTP client used by these tools does not follow redirects, so a redirect is not turned into another request. Firmware fetches, when you run them, request only the public Dell and HPE URLs in the README and `data/updates/sources.json`, plus each site's `robots.txt`. Those requests carry a user agent of `hw-spec-locator/` plus the plugin version and do not include account material. Dell catalog downloads are skipped when `robots.txt` disallows them. An HPE index fetch does not turn the HTML into package versions.

## Personal data

The plugin has no account of its own and does not collect personal data. Inventory such as serial numbers and hostnames is returned to Claude Code on this machine. It is sent onward only when you sync or apply to a host you configured.

## Contact

Questions and privacy requests: [GitHub issues](https://github.com/KateAllen533/Hw-spec-locator/issues).
