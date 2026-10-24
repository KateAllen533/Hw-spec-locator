export interface ServerNic {
  name: string;
  rail?: number;
}

export interface CablingServer {
  name: string;
  nics: ServerNic[];
}

export interface CablingLeaf {
  name: string;
  ports: string[];
}

export interface CablingLink {
  server: string;
  nic: string;
  rail: number;
  leaf: string;
  switchPort: string;
}

export interface CablingPlan {
  strategy: "rail-optimized";
  assumption: string;
  links: CablingLink[];
  rails: { rail: number; leaf: string; links: CablingLink[] }[];
  warnings: string[];
}

export function mapRailCabling(servers: CablingServer[], leaves: CablingLeaf[]): CablingPlan {
  const warnings: string[] = [];
  const orderedLeaves = [...leaves].sort((a, b) => a.name.localeCompare(b.name));
  const cursors = new Map(orderedLeaves.map((leaf) => [leaf.name, 0]));
  const railSet = new Set<number>();
  for (const server of servers) {
    server.nics.forEach((nic, index) => railSet.add(nic.rail ?? index));
  }
  const rails = [...railSet].sort((a, b) => a - b);
  if (orderedLeaves.length < rails.length) {
    throw new Error(`Rail-optimized cabling needs ${rails.length} leaves and only ${orderedLeaves.length} were provided.`);
  }
  const leafForRail = new Map<number, string>();
  rails.forEach((rail, index) => leafForRail.set(rail, orderedLeaves[index].name));
  const links: CablingLink[] = [];
  for (const server of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
    const seenRails = new Set<number>();
    for (const [index, nic] of server.nics.entries()) {
      const rail = nic.rail ?? index;
      if (seenRails.has(rail)) warnings.push(`${server.name} has more than one NIC on rail ${rail}.`);
      seenRails.add(rail);
      const leafName = leafForRail.get(rail);
      if (!leafName) throw new Error(`No leaf for rail ${rail}.`);
      const leaf = orderedLeaves.find((item) => item.name === leafName);
      if (!leaf) throw new Error(`Missing leaf ${leafName}.`);
      const cursor = cursors.get(leafName) ?? 0;
      const port = leaf.ports[cursor];
      if (!port) throw new Error(`${leafName} ran out of ports while placing ${server.name} ${nic.name}.`);
      cursors.set(leafName, cursor + 1);
      links.push({ server: server.name, nic: nic.name, rail, leaf: leafName, switchPort: port });
    }
  }
  return {
    strategy: "rail-optimized",
    assumption:
      "Each rail is homed to one leaf. NIC order is the rail index unless a NIC sets rail. This is a planning heuristic for rail-optimized GPU fabrics, not a vendor reference architecture.",
    links,
    rails: rails.map((rail) => ({
      rail,
      leaf: leafForRail.get(rail) as string,
      links: links.filter((link) => link.rail === rail),
    })),
    warnings,
  };
}
