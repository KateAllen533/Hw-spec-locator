function renderConfig(intent) {
  const unverified = [];
  const warnings = [];
  if (intent.roce?.enabled) {
    unverified.push({
      reason: "No pinned QoS command mapping for PFC, ECN, or DCQCN in this plugin version.",
      text: [
        `RoCEv2 intent`,
        `pfc priorities: ${intent.roce.pfcPriorities.join(",")}`,
        `ecn min/max/probability: ${intent.roce.ecnMinKb ?? "-"}/${intent.roce.ecnMaxKb ?? "-"}/${intent.roce.ecnProbabilityPercent ?? "-"}`,
        `dcqcn: ${intent.roce.dcqcn === true}`,
        `mtu: ${intent.roce.mtu}`
      ].join("\n")
    });
  }
  if (intent.evpn) {
    unverified.push({
      reason: "EVPN/VXLAN CLI is not pinned. Parameters are recorded for review.",
      text: JSON.stringify(intent.evpn, null, 2)
    });
  }
  const pinned = renderPinned(intent);
  const header = [
    `! hw-spec-locator review draft`,
    `! hostname ${intent.hostname} design ${intent.design} nos ${intent.nos}`,
    `! Pinned commands can be applied. Lines under UNVERIFIED are not vendor-certified syntax and are omitted from apply unless HWOPS_ALLOW_UNVERIFIED_APPLY=true.`
  ];
  const unverifiedBlock = unverified.map((item) => `! UNVERIFIED: ${item.reason}
! ${item.text.split("\n").join("\n! ")}`);
  return {
    nos: intent.nos,
    reviewDraft: [...header, ...pinned, ...unverifiedBlock].join("\n"),
    pinnedCommands: pinned,
    unverified,
    warnings
  };
}
function renderPinned(intent) {
  switch (intent.nos) {
    case "aos-cx":
      return renderAosCx(intent);
    case "os10":
      return renderOs10(intent);
    case "sonic":
      return [JSON.stringify(renderSonic(intent), null, 2)];
    case "cumulus-nvue":
      return renderNvue(intent);
    case "junos":
      return renderJunos(intent);
  }
}
function renderAosCx(intent) {
  const lines = [`hostname ${intent.hostname}`];
  for (const vlan of intent.vlans) {
    lines.push(`vlan ${vlan.id}`, `    name ${sanitize(vlan.name)}`);
  }
  for (const lag of intent.lags ?? []) {
    lines.push(`interface lag ${lagNumeric(lag.id)}`, `    no shutdown`, `    description ${sanitize(lag.purpose ?? "lag")}`);
    if (lag.lacp) lines.push(`    lacp mode active`);
    if (lag.mtu) lines.push(`    mtu ${lag.mtu}`);
    lines.push(...aosVlan(lag, "    "));
  }
  for (const iface of intent.interfaces) {
    lines.push(`interface ${iface.name}`, `    no shutdown`);
    if (iface.description) lines.push(`    description ${sanitize(iface.description)}`);
    if (iface.mtu || iface.roce && intent.roce) lines.push(`    mtu ${iface.mtu ?? intent.roce?.mtu}`);
    if (iface.lag) lines.push(`    lag ${lagNumeric(iface.lag)}`);
    else lines.push(...aosVlan(iface, "    "));
  }
  if (intent.mlag?.kind === "vsx") {
    lines.push(`vsx`);
    if (intent.mlag.systemMac) lines.push(`    system-mac ${intent.mlag.systemMac}`);
    if (intent.mlag.islLag) lines.push(`    inter-switch-link lag ${lagNumeric(intent.mlag.islLag)}`);
    if (intent.mlag.role) lines.push(`    role ${intent.mlag.role}`);
    if (intent.mlag.keepalivePeer && intent.mlag.keepaliveSource) {
      const vrf = intent.mlag.keepaliveVrf ? ` vrf ${intent.mlag.keepaliveVrf}` : "";
      lines.push(`    keepalive peer ${intent.mlag.keepalivePeer} source ${intent.mlag.keepaliveSource}${vrf}`);
    }
  }
  return lines;
}
function aosVlan(item, indent) {
  if (item.mode === "access" && item.accessVlan) return [`${indent}vlan access ${item.accessVlan}`];
  if (item.mode === "trunk") {
    const lines = [];
    if (item.nativeVlan) lines.push(`${indent}vlan trunk native ${item.nativeVlan}`);
    if (item.trunkVlans && item.trunkVlans.length > 0) lines.push(`${indent}vlan trunk allowed ${item.trunkVlans.join(",")}`);
    return lines;
  }
  return [];
}
function renderOs10(intent) {
  const lines = [`hostname ${intent.hostname}`];
  for (const vlan of intent.vlans) {
    lines.push(`interface vlan${vlan.id}`, ` no shutdown`, ` description ${sanitize(vlan.name)}`);
  }
  for (const lag of intent.lags ?? []) {
    lines.push(`interface port-channel${lagNumeric(lag.id)}`, ` no shutdown`);
    if (lag.mtu) lines.push(` mtu ${lag.mtu}`);
    lines.push(...os10Switchport(lag, " "));
  }
  for (const iface of intent.interfaces) {
    lines.push(`interface ${iface.name}`, ` no shutdown`);
    if (iface.description) lines.push(` description ${sanitize(iface.description)}`);
    if (iface.mtu || iface.roce && intent.roce) lines.push(` mtu ${iface.mtu ?? intent.roce?.mtu}`);
    if (iface.lag) lines.push(` channel-group ${lagNumeric(iface.lag)} mode ${intent.lags?.find((lag) => lag.id === iface.lag)?.lacp === false ? "on" : "active"}`);
    else lines.push(...os10Switchport(iface, " "));
  }
  if (intent.mlag?.kind === "vlt") {
    lines.push(`vlt-domain ${intent.mlag.domainId ?? 1}`);
    if (intent.mlag.backupDestination) lines.push(` backup destination ${intent.mlag.backupDestination}`);
    if (intent.mlag.discoveryInterfaces && intent.mlag.discoveryInterfaces.length > 0) {
      lines.push(` discovery-interface ${intent.mlag.discoveryInterfaces.join(",")}`);
    }
    lines.push(` peer-routing`);
  }
  return lines;
}
function os10Switchport(item, indent) {
  if (item.mode === "access" && item.accessVlan) return [`${indent}switchport mode access`, `${indent}switchport access vlan ${item.accessVlan}`];
  if (item.mode === "trunk" && item.trunkVlans && item.trunkVlans.length > 0) {
    return [`${indent}switchport mode trunk`, `${indent}switchport trunk allowed vlan ${item.trunkVlans.join(",")}`];
  }
  return [];
}
function renderSonic(intent) {
  const vlan = {};
  const members = {};
  const ports = {};
  const portchannels = {};
  const portchannelMembers = {};
  for (const item of intent.vlans) vlan[`Vlan${item.id}`] = { vlanid: String(item.id), name: item.name };
  for (const lag of intent.lags ?? []) {
    const name = `PortChannel${lagNumeric(lag.id).toString().padStart(4, "0")}`;
    portchannels[name] = { admin_status: "up", ...lag.mtu ? { mtu: String(lag.mtu) } : {} };
    for (const member of lag.members) portchannelMembers[`${name}|${member}`] = {};
    addVlanMembers(members, name, lag);
  }
  for (const iface of intent.interfaces) {
    ports[iface.name] = {
      admin_status: "up",
      ...iface.mtu || iface.roce && intent.roce ? { mtu: String(iface.mtu ?? intent.roce?.mtu) } : {},
      ...iface.description ? { description: iface.description } : {}
    };
    if (!iface.lag) addVlanMembers(members, iface.name, iface);
  }
  return {
    DEVICE_METADATA: { localhost: { hostname: intent.hostname } },
    VLAN: vlan,
    VLAN_MEMBER: members,
    PORT: ports,
    PORTCHANNEL: portchannels,
    PORTCHANNEL_MEMBER: portchannelMembers
  };
}
function addVlanMembers(members, port, item) {
  if (item.mode === "access" && item.accessVlan) members[`Vlan${item.accessVlan}|${port}`] = { tagging_mode: "untagged" };
  if (item.mode === "trunk") {
    for (const vlan of item.trunkVlans ?? []) members[`Vlan${vlan}|${port}`] = { tagging_mode: "tagged" };
  }
}
function renderNvue(intent) {
  const lines = [`nv set system hostname ${intent.hostname}`];
  for (const vlan of intent.vlans) lines.push(`nv set bridge domain br_default vlan ${vlan.id}`);
  for (const lag of intent.lags ?? []) {
    const name = `bond${lagNumeric(lag.id)}`;
    lines.push(`nv set interface ${name} type bond`);
    for (const member of lag.members) lines.push(`nv set interface ${name} bond member ${member}`);
    if (lag.mtu) lines.push(`nv set interface ${name} link mtu ${lag.mtu}`);
    lines.push(...nvueVlan(name, lag));
  }
  for (const iface of intent.interfaces) {
    if (iface.description) lines.push(`nv set interface ${iface.name} description ${sanitize(iface.description)}`);
    if (iface.mtu || iface.roce && intent.roce) lines.push(`nv set interface ${iface.name} link mtu ${iface.mtu ?? intent.roce?.mtu}`);
    if (!iface.lag) lines.push(...nvueVlan(iface.name, iface));
  }
  return lines;
}
function nvueVlan(name, item) {
  const vlans = item.mode === "access" && item.accessVlan ? [item.accessVlan] : item.mode === "trunk" ? item.trunkVlans ?? [] : [];
  return vlans.map((vlan) => `nv set interface ${name} bridge domain br_default vlan ${vlan}`);
}
function renderJunos(intent) {
  const lines = [`set system host-name ${intent.hostname}`];
  for (const vlan of intent.vlans) {
    lines.push(`set vlans ${vlanName(vlan)} vlan-id ${vlan.id}`);
    if (vlan.description) lines.push(`set vlans ${vlanName(vlan)} description ${sanitize(vlan.description)}`);
  }
  for (const lag of intent.lags ?? []) {
    const ae = `ae${lagNumeric(lag.id)}`;
    for (const member of lag.members) lines.push(`set interfaces ${member} ether-options 802.3ad ${ae}`);
    if (lag.lacp) lines.push(`set interfaces ${ae} aggregated-ether-options lacp active`);
    if (lag.mtu) lines.push(`set interfaces ${ae} mtu ${lag.mtu}`);
    lines.push(...junosSwitch(ae, lag, intent));
  }
  for (const iface of intent.interfaces) {
    if (iface.description) lines.push(`set interfaces ${iface.name} description ${sanitize(iface.description)}`);
    if (iface.mtu || iface.roce && intent.roce) lines.push(`set interfaces ${iface.name} mtu ${iface.mtu ?? intent.roce?.mtu}`);
    if (!iface.lag) lines.push(...junosSwitch(iface.name, iface, intent));
  }
  return lines;
}
function junosSwitch(name, item, intent) {
  const unit = `set interfaces ${name} unit 0 family ethernet-switching`;
  if (item.mode === "access" && item.accessVlan) {
    const vlan = intent.vlans.find((entry) => entry.id === item.accessVlan);
    return [`${unit} interface-mode access`, `${unit} vlan members ${vlan ? vlanName(vlan) : `v${item.accessVlan}`}`];
  }
  if (item.mode === "trunk") {
    const lines = [`${unit} interface-mode trunk`];
    for (const id of item.trunkVlans ?? []) {
      const vlan = intent.vlans.find((entry) => entry.id === id);
      lines.push(`${unit} vlan members ${vlan ? vlanName(vlan) : `v${id}`}`);
    }
    return lines;
  }
  return [];
}
function vlanName(vlan) {
  const cleaned = vlan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || `v${vlan.id}`;
}
function sanitize(value) {
  return value.replace(/[\r\n]/g, " ").trim();
}
function lagNumeric(id) {
  const match = /(\d+)/.exec(id);
  return match ? Number(match[1]) : 1;
}

export { renderConfig as r };
