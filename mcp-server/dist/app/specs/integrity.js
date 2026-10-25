const VERIFICATIONS = /* @__PURE__ */ new Set(["verified", "unverified", "unavailable"]);
function isClaim(value) {
  return Boolean(value && typeof value === "object" && "verification" in value && "sourceIds" in value && "value" in value);
}
function walk(productId, node, path, sources, issues) {
  if (!node || typeof node !== "object") return;
  if (isClaim(node)) {
    if (!VERIFICATIONS.has(node.verification)) {
      issues.push({ productId, path, message: `Unknown verification ${String(node.verification)}` });
    }
    if (!Array.isArray(node.sourceIds)) {
      issues.push({ productId, path, message: "sourceIds must be an array" });
    } else {
      for (const id of node.sourceIds) {
        if (!sources.has(id)) issues.push({ productId, path, message: `Unknown sourceId ${id}` });
      }
      if (node.verification === "verified" && node.sourceIds.length === 0) {
        issues.push({ productId, path, message: "verified claim has no sourceIds" });
      }
    }
    if (node.verification === "unavailable" && node.value !== null) {
      issues.push({ productId, path, message: "unavailable claim must have a null value" });
    }
    if (node.verification === "verified" && node.value === null) {
      issues.push({ productId, path, message: "verified claim has a null value" });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(productId, item, `${path}[${i}]`, sources, issues));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "firmwareBaseline") {
      const fb = value;
      if (!fb || !Array.isArray(fb.components)) {
        issues.push({ productId, path: `${path}.firmwareBaseline`, message: "firmwareBaseline.components must be an array" });
        continue;
      }
      if (fb.status === "unavailable" && fb.components.length > 0) {
        issues.push({ productId, path: `${path}.firmwareBaseline`, message: "unavailable baseline must not contain versions" });
      }
      for (const [index, component] of fb.components.entries()) {
        if (!component.version || !component.sourceUrl || !component.retrievedAt) {
          issues.push({
            productId,
            path: `${path}.firmwareBaseline.components[${index}]`,
            message: "firmware component is missing version, sourceUrl, or retrievedAt"
          });
        }
      }
      continue;
    }
    walk(productId, value, `${path}.${key}`, sources, issues);
  }
}
function checkCatalog(catalog) {
  const issues = [];
  const sources = new Set(catalog.sources.map((s) => s.id));
  if (catalog.sources.length === 0) issues.push({ path: "sources", message: "catalog has no sources" });
  for (const source of catalog.sources) {
    if (!source.url || !source.retrievedAt || !source.title) {
      issues.push({ path: `sources.${source.id}`, message: "source is missing url, title, or retrievedAt" });
    }
  }
  const ids = /* @__PURE__ */ new Set();
  for (const product of catalog.products) {
    if (ids.has(product.id)) issues.push({ productId: product.id, path: "id", message: "duplicate product id" });
    ids.add(product.id);
    if (!product.support) issues.push({ productId: product.id, path: "support", message: "missing support claim" });
    walk(product.id, product, product.id, sources, issues);
    for (const ref of product.referenceConfigurations) {
      if (ref.verification === "verified" && ref.sourceIds.length === 0) {
        issues.push({ productId: product.id, path: `referenceConfigurations.${ref.id}`, message: "verified reference has no source" });
      }
      for (const id of ref.sourceIds) {
        if (!sources.has(id)) {
          issues.push({ productId: product.id, path: `referenceConfigurations.${ref.id}`, message: `Unknown sourceId ${id}` });
        }
      }
    }
  }
  return issues;
}

export { checkCatalog as c };
