# Local firmware mirror

This directory is the air-gapped layout for catalog metadata and, when you explicitly place them here, firmware packages. The starter tree does not contain vendor binaries.

```
mirror/
  dell/catalog/     Dell catalog XML you imported with updates_import_local
  hpe/sdr/          HPE SDR metadata or Packages files you imported
```

`downloads.dell.com` robots.txt disallows automated download of `/catalog/`. Do not point the fetcher at that URL and expect a download. Save the catalog from a browser session you are entitled to use, then run:

```bash
node mcp-server/dist/index.js import-local \
  --file /path/to/Catalog.xml.gz \
  --vendor Dell \
  --source-id dell-lc-catalog
```

The importer copies the file under `dell/catalog/` and records only versions the parser recognizes. A file it cannot parse produces zero versions.
