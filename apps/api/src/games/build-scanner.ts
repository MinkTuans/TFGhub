import JSZip from 'jszip';

const MAX_FILES = 200;
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
const BLOCKED_EXTENSIONS = ['.exe', '.dll', '.bat', '.cmd', '.sh', '.msi'];

export type ScanResult =
  | { ok: true }
  | { ok: false; findings: string };

function normalizeEntryName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\//, '');
}

function centralDirectoryNames(archive: Buffer): string[] | null {
  const end = archive.length - 22;
  let eocd = -1;
  for (let i = end; i >= 0; i -= 1) {
    if (
      archive[i] === 0x50 &&
      archive[i + 1] === 0x4b &&
      archive[i + 2] === 0x05 &&
      archive[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdOffset = archive.readUInt32LE(eocd + 16);
  const cdSize = archive.readUInt32LE(eocd + 12);
  const names: string[] = [];
  let pos = cdOffset;
  const limit = cdOffset + cdSize;
  while (pos + 46 <= limit) {
    if (archive[pos] !== 0x50 || archive[pos + 1] !== 0x4b) break;
    const nameLen = archive.readUInt16LE(pos + 28);
    const extraLen = archive.readUInt16LE(pos + 30);
    const commentLen = archive.readUInt16LE(pos + 32);
    names.push(archive.subarray(pos + 46, pos + 46 + nameLen).toString('utf8'));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

export async function scanHtml5Zip(archive: Buffer): Promise<ScanResult> {
  if (archive.length < 4 || archive.subarray(0, 2).toString('ascii') !== 'PK') {
    return { ok: false, findings: 'Upload must be a zip archive.' };
  }

  const listed = centralDirectoryNames(archive) ?? [];
  for (const raw of listed) {
    const name = normalizeEntryName(raw);
    if (!name || name.includes('..') || name.startsWith('/') || name.includes(':')) {
      return { ok: false, findings: `Unsafe path: ${raw}` };
    }
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    return { ok: false, findings: 'Zip archive could not be read.' };
  }

  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length === 0) {
    return { ok: false, findings: 'Archive is empty.' };
  }
  if (files.length > MAX_FILES) {
    return { ok: false, findings: `Archive has too many files (max ${MAX_FILES}).` };
  }

  let uncompressed = 0;
  let hasIndex = false;
  for (const entry of files) {
    const name = normalizeEntryName(entry.name);
    if (!name || name.includes('..') || name.startsWith('/') || name.includes(':')) {
      return { ok: false, findings: `Unsafe path: ${entry.name}` };
    }
    const lower = name.toLowerCase();
    if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return { ok: false, findings: `Blocked file type: ${name}` };
    }
    const bytes = await entry.async('uint8array');
    uncompressed += bytes.byteLength;
    if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
      return { ok: false, findings: 'Uncompressed archive is too large.' };
    }
    if (lower === 'index.html' || lower.endsWith('/index.html')) {
      hasIndex = true;
    }
  }

  if (!hasIndex) {
    return { ok: false, findings: 'HTML5 builds must include index.html.' };
  }
  return { ok: true };
}
