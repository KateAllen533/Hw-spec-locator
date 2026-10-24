---
description: Export or verify a checksummed offline bundle for an air-gapped site
argument-hint: "[export|verify] [directory]"
---

The user wants an air-gapped bundle: $ARGUMENTS

Use `updates_bundle_export` or `updates_bundle_verify`. The bundle contains `manifest.json`, `SHA256SUMS`, specs, the update cache, and the local mirror layout. A signature is added only when `HWOPS_BUNDLE_SIGNING_KEY` is set, and the private key is not copied into the bundle. Verification with a present signature requires `HWOPS_BUNDLE_PUBLIC_KEY`. Tell the user to carry the bundle directory, then set `HWOPS_OFFLINE=true` and `HWOPS_OFFLINE_BUNDLE` to that directory.
