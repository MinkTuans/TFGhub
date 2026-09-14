import { crc32 } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { scanHtml5Zip } from './build-scanner.js';

async function zipWith(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(body);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.write('PK\x03\x04');
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localEntry = Buffer.concat([local, nameBuf, data]);
    const central = Buffer.alloc(46);
    central.write('PK\x01\x02');
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    locals.push(localEntry);
    offset += localEntry.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.write('PK\x05\x06');
  end.writeUInt16LE(files.length ? Object.keys(files).length : 0, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, end]);
}

describe('scanHtml5Zip', () => {
  it('accepts a zip that contains index.html', async () => {
    const archive = await zipWith({ 'index.html': '<html></html>' });
    await expect(scanHtml5Zip(archive)).resolves.toEqual({ ok: true });
  });

  it('rejects missing index.html', async () => {
    const archive = await zipWith({ 'readme.txt': 'no game' });
    await expect(scanHtml5Zip(archive)).resolves.toEqual({
      ok: false,
      findings: 'HTML5 builds must include index.html.',
    });
  });

  it('rejects path traversal entries', async () => {
    const archive = storedZip({
      'index.html': '<html></html>',
      '../secret.txt': 'nope',
    });
    await expect(scanHtml5Zip(archive)).resolves.toMatchObject({ ok: false });
  });

  it('rejects executable files', async () => {
    const archive = await zipWith({
      'index.html': '<html></html>',
      'payload.exe': 'MZ',
    });
    await expect(scanHtml5Zip(archive)).resolves.toEqual({
      ok: false,
      findings: 'Blocked file type: payload.exe',
    });
  });

  it('rejects non-zip bytes', async () => {
    await expect(scanHtml5Zip(Buffer.from('not-a-zip'))).resolves.toEqual({
      ok: false,
      findings: 'Upload must be a zip archive.',
    });
  });
});
