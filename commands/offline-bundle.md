---
description: Write or verify a checksummed offline bundle for an air-gapped site
argument-hint: "[write|verify] [directory]"
---

The user wants an air-gapped bundle: $ARGUMENTS

Use `updates_bundle_export` or `updates_bundle_verify`. The bundle contains `manifest.json`, `SHA256SUMS`, specs, the update cache, and the local mirror layout. A signature is added only when the `bundle_signing_key` plugin setting contains a PEM private key, and that key is not copied into the bundle. Verification with a present signature requires the `bundle_public_key` plugin setting. Tell the user to carry the bundle directory, then turn on offline mode and point `HWOPS_OFFLINE_BUNDLE` at that directory.
