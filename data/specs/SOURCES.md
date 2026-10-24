# Specification provenance

Retrieved 2026-10-24. Each product claim points at one of these source ids. `verified` requires a publisher URL that was fetched. `unverified` is kept only for the XD685 third-party PDF and for table cells whose column alignment was ambiguous. `unavailable` is null and has no invented substitute.

Firmware and driver baselines in the starter products are `unavailable` with an empty component list. No BIOS, iLO, iDRAC, or driver version was copied out of these spec sheets.

## Publisher sources

| Id | Document | URL |
| --- | --- | --- |
| `hpe-dl380-gen11-qs` | HPE ProLiant DL380 Gen11 QuickSpecs | https://www.hpe.com/us/en/collaterals/collateral.a50004307enw.html |
| `hpe-dl380a-gen12-qs` | HPE ProLiant Compute DL380a Gen12 QuickSpecs | https://www.hpe.com/us/en/collaterals/collateral.a00047453enw.html |
| `hpe-dl380a-gen12-product` | DL380a Gen12 product page | https://www.hpe.com/us/en/products/compute/proliant/dl380a-gen12.html |
| `hpe-dl384-gen12-qs` | HPE ProLiant Compute DL384 Gen12 QuickSpecs | https://www.hpe.com/us/en/collaterals/collateral.a50009209enw.html |
| `hpe-dl384-gen12-specs` | DL384 Gen12 specifications, Australia catalog | https://www.hpe.com/au/en/product-catalog/compute/proliant-servers/pip.specifications.proliant-dl300-servers.1014835194.html |
| `dell-r760-spec` | PowerEdge R760 specification sheet | https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760-spec-sheet.pdf |
| `dell-r760-tech` | PowerEdge R760 Technical Guide | https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760-technical-guide.pdf |
| `dell-xe9680-spec` | PowerEdge XE9680 specification sheet | https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe9680-spec-sheet.pdf |
| `dell-xe8640-spec` | PowerEdge XE8640 specification sheet | https://www.delltechnologies.com/asset/da-dk/products/servers/technical-support/poweredge-xe8640-spec-sheet.pdf |
| `dell-xe9712-spec` | PowerEdge XE9712 specification sheet | https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe9712-spec-sheet.pdf |
| `dell-powerscale-f710` | PowerScale all-flash nodes, F710 section (h15963) | https://www.delltechnologies.com/asset/da-dk/products/storage/technical-support/h15963-ss-powerscale-all-flash-nodes.pdf |
| `hpe-alletra-b10000-qs` | HPE Alletra Storage MP B10000 QuickSpecs | https://www.hpe.com/int/en/collaterals/collateral.a50006985enw.html |
| `hpe-cx9300-qs` | Aruba CX 9300 Switch Series QuickSpecs | https://www.hpe.com/us/en/collaterals/collateral.a50004291enw.html |
| `dell-z9864f-spec` | PowerSwitch Z9864F-ON specification sheet | https://www.delltechnologies.com/asset/en-us/products/networking/technical-support/dell-powerswitch-z9864f-on-spec-sheet.pdf |

## Not confirmed on the publisher site

| Id | What was used | Why it is unverified |
| --- | --- | --- |
| `hpe-xd685-qs-third-party` | PDF hosted at `tmv.co.th`, filename contains HPE document id `a00073553enw` | `https://www.hpe.com/us/en/collaterals/collateral.a00073553enw.html` failed with an HTTP/2 error on 2026-10-24. Every XD685 claim stays `unverified`. |

## Deliberately omitted

- Support and end-of-life dates, unless a page stated a warranty term and that term is stored as warranty rather than end of support.
- OneFS version for PowerScale F710. The operating-system row in the extract was ambiguous. Footnotes that name 9.7, 9.10, 9.11, or 9.14 stay notes, not a firmware component.
- R660 processor options. F710 is described as a 1U node on R660, and the R660 option table was not copied.
- System planning watts wherever the page listed only power-supply option watts or, for XE9712, the 33 kW rack shelf.
- Sparsity FLOPS, NIC option matrices that were not extracted cleanly, and AOS-CX or SONiC version numbers the sheets did not state.
- Cray XD, Juniper platforms, ProLiant DL360, Synergy, PowerStore, and OS10 S-series switches. See `coverage.json`.

## Plugin-authored indexes

`solutions.json` lists which of the products above sit in the Dell AI Factory index and which sit in the HPE Private Cloud AI index. `notAVendorDocument` is true. Those files are navigation, not vendor architectures or firmware baselines.
