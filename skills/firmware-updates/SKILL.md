---
name: firmware-updates
description: Fetch or import Dell and HPE firmware, BIOS, driver, and advisory metadata without inventing versions. Use when the user asks for the latest catalog, an SPP or SDR package, or a release note.
---

Use `updates_search` first. Use `updates_fetch` to refresh configured public sources. Use `updates_import_local` when the user already has a catalog file.

Rules:

- Never invent a version, release date, or advisory id. If the cache is empty or the source status is `unavailable`, say that.
- `downloads.dell.com` robots.txt disallows `/` except `/manuals` and `/topicspdf`. The fetcher must not download `Catalog.xml.gz` or `Catalog.gz`. Tell the user to save a catalog they are entitled to use, then import it.
- The HPE SDR index may be fetched when robots.txt is absent. HTML is not scraped into versions. A `fetched-unparsed` result means zero package versions.
- Every record must keep its source URL and retrieval time. If a field is missing, omit the record rather than guessing.
- A retrieved package is not a vendor-certified baseline unless the source itself is a validated stack catalog. Do not label the newest version "recommended" on your own.
- Respect the rate limit. Do not retry a disallowed URL by changing the path to slip past robots.txt.
