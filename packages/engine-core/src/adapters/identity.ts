import type { EngineProjectV1 as EngineProject } from '../project-schema.js';

export const LEGACY_ID_NAMESPACE = '01435a7b-8ad1-52aa-93b6-d65b53dccfc2';

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new TypeError('Namespace must be a UUID');
  return Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function rotateLeft(value: number, bits: number) {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3]! ^ words[index - 8]! ^ words[index - 14]! ^ words[index - 16]!, 1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temporary = (rotateLeft(a, 5) + f + e + k + words[index]!) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temporary;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const output = new Uint8Array(20);
  const outputView = new DataView(output.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => outputView.setUint32(index * 4, value));
  return output;
}

export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = uuidBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type LegacyIdentityAllocator = {
  immutable: (kind: string, parentId: string, legacyId: string) => string;
  role: (kind: string, parentId: string, role: string) => string;
  content: (kind: string, parentId: string, value: unknown, duplicateIndex?: number) => string;
};

export function createLegacyIdentityAllocator(gameId: string): LegacyIdentityAllocator {
  const issuedNames = new Set<string>();
  const issuedIds = new Set<string>();
  const allocate = (kind: string, parentId: string, identity: string) => {
    const name = `game:${gameId}/parent:${parentId}/kind:${kind}/${identity}`;
    if (issuedNames.has(name)) throw new Error(`Duplicate legacy identity: ${name}`);
    const id = uuidV5(name, LEGACY_ID_NAMESPACE);
    if (issuedIds.has(id)) throw new Error(`Deterministic Stable ID collision: ${id}`);
    issuedNames.add(name);
    issuedIds.add(id);
    return id;
  };
  return {
    immutable: (kind, parentId, legacyId) => allocate(kind, parentId, `legacy:${legacyId}`),
    role: (kind, parentId, role) => allocate(kind, parentId, `role:${role}`),
    content: (kind, parentId, value, duplicateIndex = 0) => {
      const fingerprint = uuidV5(stableStringify(value), LEGACY_ID_NAMESPACE);
      return allocate(kind, parentId, `content:${fingerprint}/duplicate:${duplicateIndex}`);
    },
  };
}

export type LegacyAdapterResult =
  | { status: 'CONVERTED'; project: EngineProject; canonicalJson: string }
  | { status: 'INVALID_LEGACY'; raw: unknown; diagnostics: string[] }
  | { status: 'UNSUPPORTED_SOURCE_TYPE'; sourceType: 'CODE' | 'UPLOAD'; raw: unknown; diagnostics: string[] };
