import dgram from 'node:dgram';

function udpTransport() {
  return (packet, host, port, timeoutMs) => new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`SNMP timed out talking to ${host}:${port}`));
    }, timeoutMs);
    socket.once("message", (msg) => {
      clearTimeout(timer);
      socket.close();
      resolve(msg);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.send(packet, port, host);
  });
}
async function snmpGet(options) {
  const requestId = Math.floor(Math.random() * 1e5) + 1;
  const packet = encodeGet(options.community, requestId, options.oids);
  const transport = udpTransport();
  const response = await transport(packet, options.host, options.port ?? 161, options.timeoutMs ?? 4e3);
  return decodeResponse(response);
}
const SNMP_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysName: "1.3.6.1.2.1.1.5.0"};
function encodeGet(community, requestId, oids) {
  const varbinds = oids.map((oid) => tlv(48, Buffer.concat([encodeOid(oid), Buffer.from([5, 0])])));
  const pdu = tlv(160, Buffer.concat([encodeInteger(requestId), encodeInteger(0), encodeInteger(0), tlv(48, Buffer.concat(varbinds))]));
  return tlv(48, Buffer.concat([encodeInteger(1), encodeOctet(community), pdu]));
}
function decodeResponse(packet) {
  const message = readTlv(packet, 0);
  if (message.tag !== 48) throw new Error("SNMP response is not a sequence.");
  let offset = 0;
  readTlv(message.value, offset);
  offset = nextOffset(message.value, offset);
  offset = nextOffset(message.value, offset);
  const pdu = readTlv(message.value, offset);
  if (pdu.tag !== 162 && pdu.tag !== 160) throw new Error(`Unexpected SNMP PDU tag ${pdu.tag}.`);
  let pduOffset = 0;
  pduOffset = nextOffset(pdu.value, pduOffset);
  const errorStatus = readTlv(pdu.value, pduOffset);
  pduOffset = nextOffset(pdu.value, pduOffset);
  const errorIndex = readTlv(pdu.value, pduOffset);
  pduOffset = nextOffset(pdu.value, pduOffset);
  if (decodeInteger(errorStatus.value) !== 0) {
    throw new Error(`SNMP error-status ${decodeInteger(errorStatus.value)} at index ${decodeInteger(errorIndex.value)}.`);
  }
  const vbl = readTlv(pdu.value, pduOffset);
  const bindings = [];
  let cursor = 0;
  while (cursor < vbl.value.length) {
    const bind = readTlv(vbl.value, cursor);
    const oid = readTlv(bind.value, 0);
    const value = readTlv(bind.value, nextOffset(bind.value, 0));
    bindings.push({ oid: decodeOid(oid.value), ...decodeValue(value.tag, value.value) });
    cursor += bind.byteLength;
  }
  return bindings;
}
function decodeValue(tag, value) {
  if (tag === 2) return { type: "integer", value: decodeInteger(value) };
  if (tag === 4) return { type: "octet", value: value.toString("utf8") };
  if (tag === 6) return { type: "oid", value: decodeOid(value) };
  if (tag === 5) return { type: "null", value: null };
  return { type: "other", value: value.toString("hex") };
}
function tlv(tag, value) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
}
function encodeLength(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 255);
    rest = Math.floor(rest / 256);
  }
  return Buffer.from([128 | bytes.length, ...bytes]);
}
function encodeInteger(value) {
  const bytes = [];
  let rest = value < 0 ? value : value;
  if (value === 0) bytes.push(0);
  else if (value > 0) {
    while (rest > 0) {
      bytes.unshift(rest & 255);
      rest = Math.floor(rest / 256);
    }
    if (bytes[0] & 128) bytes.unshift(0);
  } else {
    let n = value;
    const tmp = [];
    for (let i = 0; i < 4; i++) {
      tmp.unshift(n & 255);
      n >>= 8;
    }
    while (tmp.length > 1 && tmp[0] === 255 && tmp[1] & 128) tmp.shift();
    bytes.push(...tmp);
  }
  return tlv(2, Buffer.from(bytes));
}
function encodeOctet(value) {
  return tlv(4, Buffer.from(value, "utf8"));
}
function encodeOid(oid) {
  const parts = oid.split(".").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) throw new Error(`Invalid OID ${oid}`);
  const body = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) body.push(...base128(part));
  return tlv(6, Buffer.from(body));
}
function base128(value) {
  const bytes = [value & 127];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift(rest & 127 | 128);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}
function readTlv(buffer, offset) {
  const tag = buffer[offset];
  let length = buffer[offset + 1];
  let start = offset + 2;
  if (length & 128) {
    const count = length & 127;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + buffer[start + i];
    start += count;
  }
  return { tag, value: buffer.subarray(start, start + length), byteLength: start + length - offset };
}
function nextOffset(buffer, offset) {
  return offset + readTlv(buffer, offset).byteLength;
}
function decodeInteger(value) {
  let n = value[0] & 128 ? -1 : 0;
  for (const byte of value) n = n << 8 | byte;
  return n;
}
function decodeOid(value) {
  const first = value[0];
  const parts = [Math.floor(first / 40), first % 40];
  let current = 0;
  for (const byte of value.subarray(1)) {
    current = current << 7 | byte & 127;
    if ((byte & 128) === 0) {
      parts.push(current);
      current = 0;
    }
  }
  return parts.join(".");
}

export { SNMP_OIDS as S, snmpGet as s };
