import { s as sourceById } from './load.js';

function haystack(product) {
  return [product.id, product.vendor, product.family, product.model, product.category, product.generation, product.summary, ...product.keywords].filter(Boolean).join(" ").toLowerCase();
}
function searchProducts(catalog, input) {
  const q = input.query?.trim().toLowerCase();
  const limit = input.limit ?? 20;
  return catalog.products.filter((product) => {
    if (input.vendor && product.vendor.toLowerCase() !== input.vendor.toLowerCase()) return false;
    if (input.category && product.category !== input.category) return false;
    if (input.aiFactory !== void 0 && product.aiFactory !== input.aiFactory) return false;
    if (q && !haystack(product).includes(q)) return false;
    return true;
  }).slice(0, limit);
}
function getProduct(catalog, id) {
  return catalog.products.find((product) => product.id === id || product.model.toLowerCase() === id.toLowerCase()) ?? null;
}
function compareProducts(catalog, ids) {
  const products = ids.map((id) => {
    const product = getProduct(catalog, id);
    if (!product) return { id, found: false };
    return {
      id: product.id,
      found: true,
      vendor: product.vendor,
      model: product.model,
      category: product.category,
      aiFactory: product.aiFactory,
      formFactor: product.formFactor ?? null,
      processors: product.processors ?? null,
      memory: product.memory ?? null,
      storage: product.storage ?? null,
      networking: product.networking ?? null,
      accelerators: product.accelerators ?? null,
      power: product.power ?? null,
      support: product.support,
      firmwareBaseline: product.firmwareBaseline,
      sources: collectSources(catalog, product)
    };
  });
  return {
    note: "Compare only fields whose verification is verified when making a design decision. unverified values are quotes from a non-publisher copy or an ambiguous extract. unavailable means this dataset does not contain the fact.",
    products
  };
}
function collectSources(catalog, product) {
  const ids = /* @__PURE__ */ new Set();
  const stack = [product];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const record = node;
    if (Array.isArray(record.sourceIds)) {
      for (const id of record.sourceIds) if (typeof id === "string") ids.add(id);
    }
    for (const value of Object.values(record)) stack.push(value);
  }
  return [...ids].map((id) => sourceById(catalog, id)).filter(Boolean);
}
function planningWatts(product) {
  const power = product.power;
  if (!power || power.verification === "unavailable" || !power.value) {
    return { watts: null, basis: power?.note ?? "No planning wattage in the dataset.", incomplete: true };
  }
  const value = power.value;
  const system = value.systemPlanningWatts;
  if (typeof system === "number") {
    return {
      watts: system,
      basis: typeof value.planningBasis === "string" ? value.planningBasis : "systemPlanningWatts",
      incomplete: false
    };
  }
  return {
    watts: null,
    basis: typeof value.note === "string" ? value.note : "No system planning wattage published in the starter extract.",
    incomplete: true
  };
}
function acceleratorTdpSum(product) {
  const accelerators = product.accelerators?.value;
  const options = accelerators && Array.isArray(accelerators.options) ? accelerators.options : [];
  const first = options[0];
  if (!first || typeof first.quantity !== "number" || typeof first.tdpWattsEach !== "number") return null;
  return {
    watts: first.quantity * first.tdpWattsEach,
    label: `Accelerator TDP only (${first.quantity} x ${first.tdpWattsEach} W). Platform, CPU, NIC, and PSU overhead are not included.`
  };
}

export { acceleratorTdpSum as a, compareProducts as b, collectSources as c, getProduct as g, planningWatts as p, searchProducts as s };
