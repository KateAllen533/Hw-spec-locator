import type { Catalog, Product } from "./types.js";
import { sourceById } from "./load.js";

export interface SpecSearchInput {
  query?: string;
  vendor?: string;
  category?: string;
  aiFactory?: boolean;
  limit?: number;
}

function haystack(product: Product): string {
  return [product.id, product.vendor, product.family, product.model, product.category, product.generation, product.summary, ...product.keywords]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function searchProducts(catalog: Catalog, input: SpecSearchInput): Product[] {
  const q = input.query?.trim().toLowerCase();
  const limit = input.limit ?? 20;
  return catalog.products
    .filter((product) => {
      if (input.vendor && product.vendor.toLowerCase() !== input.vendor.toLowerCase()) return false;
      if (input.category && product.category !== input.category) return false;
      if (input.aiFactory !== undefined && product.aiFactory !== input.aiFactory) return false;
      if (q && !haystack(product).includes(q)) return false;
      return true;
    })
    .slice(0, limit);
}

export function getProduct(catalog: Catalog, id: string): Product | null {
  return catalog.products.find((product) => product.id === id || product.model.toLowerCase() === id.toLowerCase()) ?? null;
}

export function compareProducts(catalog: Catalog, ids: string[]) {
  const products = ids.map((id) => {
    const product = getProduct(catalog, id);
    if (!product) return { id, found: false as const };
    return {
      id: product.id,
      found: true as const,
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
      sources: collectSources(catalog, product),
    };
  });
  return {
    note: "Compare only fields whose verification is verified when making a design decision. unverified values are quotes from a non-publisher copy or an ambiguous extract. unavailable means this dataset does not contain the fact.",
    products,
  };
}

export function collectSources(catalog: Catalog, product: Product) {
  const ids = new Set<string>();
  const stack: unknown[] = [product];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.sourceIds)) {
      for (const id of record.sourceIds) if (typeof id === "string") ids.add(id);
    }
    for (const value of Object.values(record)) stack.push(value);
  }
  return [...ids].map((id) => sourceById(catalog, id)).filter(Boolean);
}

export function planningWatts(product: Product): { watts: number | null; basis: string; incomplete: boolean } {
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
      incomplete: false,
    };
  }
  return {
    watts: null,
    basis: typeof value.note === "string" ? value.note : "No system planning wattage published in the starter extract.",
    incomplete: true,
  };
}

export function acceleratorTdpSum(product: Product): { watts: number; label: string } | null {
  const accelerators = product.accelerators?.value;
  const options = accelerators && Array.isArray(accelerators.options) ? accelerators.options : [];
  const first = options[0] as { quantity?: number; tdpWattsEach?: number; description?: string } | undefined;
  if (!first || typeof first.quantity !== "number" || typeof first.tdpWattsEach !== "number") return null;
  return {
    watts: first.quantity * first.tdpWattsEach,
    label: `Accelerator TDP only (${first.quantity} x ${first.tdpWattsEach} W). Platform, CPU, NIC, and PSU overhead are not included.`,
  };
}
