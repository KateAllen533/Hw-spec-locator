function mapRailCabling(servers, leaves) {
  const warnings = [];
  const orderedLeaves = [...leaves].sort((a, b) => a.name.localeCompare(b.name));
  const cursors = new Map(orderedLeaves.map((leaf) => [leaf.name, 0]));
  const railSet = /* @__PURE__ */ new Set();
  for (const server of servers) {
    server.nics.forEach((nic, index) => railSet.add(nic.rail ?? index));
  }
  const rails = [...railSet].sort((a, b) => a - b);
  if (orderedLeaves.length < rails.length) {
    throw new Error(`Rail-optimized cabling needs ${rails.length} leaves and only ${orderedLeaves.length} were provided.`);
  }
  const leafForRail = /* @__PURE__ */ new Map();
  rails.forEach((rail, index) => leafForRail.set(rail, orderedLeaves[index].name));
  const links = [];
  for (const server of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
    const seenRails = /* @__PURE__ */ new Set();
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
    assumption: "Each rail is homed to one leaf. NIC order is the rail index unless a NIC sets rail. This is a planning heuristic for rail-optimized GPU fabrics, not a vendor reference architecture.",
    links,
    rails: rails.map((rail) => ({
      rail,
      leaf: leafForRail.get(rail),
      links: links.filter((link) => link.rail === rail)
    })),
    warnings
  };
}

export { mapRailCabling as m };
