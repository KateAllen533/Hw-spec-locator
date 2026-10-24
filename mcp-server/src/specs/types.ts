export type Verification = "verified" | "unverified" | "unavailable";

export interface Claim<T> {
  verification: Verification;
  sourceIds: string[];
  value: T | null;
  note?: string;
}

export interface SourceRecord {
  id: string;
  publisher: string;
  title: string;
  url: string;
  retrievedAt: string;
  origin?: "publisher" | "third-party-copy";
  publisherOriginVerified?: boolean;
  note?: string;
}

export interface ReferenceConfiguration {
  id: string;
  title: string;
  kind: "published-configuration-option";
  verification: Verification;
  sourceIds: string[];
  components: { role: string; description: string; quantity?: number; tdpWattsEach?: number }[];
  note?: string;
}

export interface FirmwareComponent {
  name: string;
  version: string;
  componentType?: string;
  releaseDate?: string;
  sourceUrl: string;
  retrievedAt: string;
  sourceId: string;
}

export interface Product {
  id: string;
  vendor: string;
  family: string;
  model: string;
  category: "server" | "storage" | "network";
  aiFactory: boolean;
  generation?: string;
  keywords: string[];
  summary: string;
  formFactor?: Claim<string>;
  management?: Claim<string[]>;
  processors?: Claim<Record<string, unknown>>;
  memory?: Claim<Record<string, unknown>>;
  storage?: Claim<Record<string, unknown>>;
  networking?: Claim<Record<string, unknown>>;
  accelerators?: Claim<Record<string, unknown>>;
  power?: Claim<Record<string, unknown>>;
  dimensions?: Claim<Record<string, unknown>>;
  support: Claim<Record<string, unknown> | null>;
  firmwareBaseline: {
    status: "unavailable" | "sourced";
    verification: Verification;
    sourceIds: string[];
    reason: string;
    components: FirmwareComponent[];
  };
  referenceConfigurations: ReferenceConfiguration[];
  nos?: Claim<string[]>;
}

export interface CoverageEntry {
  family: string;
  status: "included" | "not-in-starter";
  productIds?: string[];
  reason: string;
}

export interface SolutionIndex {
  authoredBy: "plugin";
  notAVendorDocument: true;
  id: string;
  title: string;
  note: string;
  componentProductIds: string[];
}

export interface Catalog {
  schemaVersion: string;
  sources: SourceRecord[];
  products: Product[];
  coverage: CoverageEntry[];
  solutions: SolutionIndex[];
}
