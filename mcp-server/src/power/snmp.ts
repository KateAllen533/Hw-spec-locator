import dgram from "node:dgram";

export interface SnmpBinding {
  oid: string;
  type: "integer" | "octet" | "oid" | "null" | "other";
  value: string | number | null;
}

export type UdpTransport = (packet: Buffer, host: string, port: number, timeoutMs: number) => Promise<Buffer>;

export function udpTransport(): UdpTransport {
  return (packet, host, port, timeoutMs) =>
    new Promise((resolve, reject) => {
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

export async function snmpGet(options: {
  host: string;
  port?: number;
  community: string;
  oids: string[];
  timeoutMs?: number;
  transport?: UdpTransport;
}): Promise<SnmpBinding[]> {
  const requestId = Math.floor(Math.random() * 100000) + 1;
  const packet = encodeGet(options.community, requestId, options.oids);
  const transport = options.transport ?? udpTransport();
  const response = await transport(packet, options.host, options.port ?? 161, options.timeoutMs ?? 4000);
  return decodeResponse(response);
}

export const SNMP_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  sysObjectId: "1.3.6.1.2.1.1.2.0",
};

export function encodeGet(community: string, requestId: number, oids: string[]): Buffer {
  const varbinds = oids.map((oid) => tlv(0x30, Buffer.concat([encodeOid(oid), Buffer.from([0x05, 0x00])])));
  const pdu = tlv(0xa0, Buffer.concat([encodeInteger(requestId), encodeInteger(0), encodeInteger(0), tlv(0x30, Buffer.concat(varbinds))]));
  return tlv(0x30, Buffer.concat([encodeInteger(1), encodeOctet(community), pdu]));
}

export function decodeResponse(packet: Buffer): SnmpBinding[] {
  const message = readTlv(packet, 0);
  if (message.tag !== 0x30) throw new Error("SNMP response is not a sequence.");
  let offset = 0;
  readTlv(message.value, offset); // version
  offset = nextOffset(message.value, offset);
  offset = nextOffset(message.value, offset); // community
  const pdu = readTlv(message.value, offset);
  if (pdu.tag !== 0xa2 && pdu.tag !== 0xa0) throw new Error(`Unexpected SNMP PDU tag ${pdu.tag}.`);
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
  const bindings: SnmpBinding[] = [];
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

function decodeValue(tag: number, value: Buffer): Pick<SnmpBinding, "type" | "value"> {
  if (tag === 0x02) return { type: "integer", value: decodeInteger(value) };
  if (tag === 0x04) return { type: "octet", value: value.toString("utf8") };
  if (tag === 0x06) return { type: "oid", value: decodeOid(value) };
  if (tag === 0x05) return { type: "null", value: null };
  return { type: "other", value: value.toString("hex") };
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
}

function encodeLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length]);
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeInteger(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value < 0 ? value : value;
  if (value === 0) bytes.push(0);
  else if (value > 0) {
    while (rest > 0) {
      bytes.unshift(rest & 0xff);
      rest = Math.floor(rest / 256);
    }
    if (bytes[0] & 0x80) bytes.unshift(0);
  } else {
    let n = value;
    const tmp: number[] = [];
    for (let i = 0; i < 4; i++) {
      tmp.unshift(n & 0xff);
      n >>= 8;
    }
    while (tmp.length > 1 && tmp[0] === 0xff && tmp[1] & 0x80) tmp.shift();
    bytes.push(...tmp);
  }
  return tlv(0x02, Buffer.from(bytes));
}

function encodeOctet(value: string): Buffer {
  return tlv(0x04, Buffer.from(value, "utf8"));
}

function encodeOid(oid: string): Buffer {
  const parts = oid.split(".").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) throw new Error(`Invalid OID ${oid}`);
  const body = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) body.push(...base128(part));
  return tlv(0x06, Buffer.from(body));
}

function base128(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

interface Tlv {
  tag: number;
  value: Buffer;
  byteLength: number;
}

function readTlv(buffer: Buffer, offset: number): Tlv {
  const tag = buffer[offset];
  let length = buffer[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + buffer[start + i];
    start += count;
  }
  return { tag, value: buffer.subarray(start, start + length), byteLength: start + length - offset };
}

function nextOffset(buffer: Buffer, offset: number): number {
  return offset + readTlv(buffer, offset).byteLength;
}

function decodeInteger(value: Buffer): number {
  let n = value[0] & 0x80 ? -1 : 0;
  for (const byte of value) n = (n << 8) | byte;
  return n;
}

function decodeOid(value: Buffer): string {
  const first = value[0];
  const parts = [Math.floor(first / 40), first % 40];
  let current = 0;
  for (const byte of value.subarray(1)) {
    current = (current << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      parts.push(current);
      current = 0;
    }
  }
  return parts.join(".");
}
