// OS/2 table field offsets (from table start)
const OS2_FSTYPE = 8;
const OS2_FSSELECTION = 62;
const OS2_STYPO_ASCENDER = 68;
const OS2_STYPO_DESCENDER = 70;
const OS2_STYPO_LINEGAP = 72;

// Hhea table field offsets (from table start)
const HHEA_ASCENT = 4;
const HHEA_DESCENT = 6;
const HHEA_LINEGAP = 8;

// USE_TYPO_METRICS bit in fsSelection
const USE_TYPO_METRICS = 0x80;

function findTable(
  buf: Buffer,
  tag: string,
): { offset: number; length: number; entryOffset: number } | null {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const entryOffset = 12 + i * 16;
    const tableTag = buf.toString("ascii", entryOffset, entryOffset + 4);
    if (tableTag === tag) {
      return {
        offset: buf.readUInt32BE(entryOffset + 8),
        length: buf.readUInt32BE(entryOffset + 12),
        entryOffset,
      };
    }
  }
  return null;
}

function calcTableChecksum(buf: Buffer, offset: number, length: number): number {
  let sum = 0;
  const end = offset + ((length + 3) & ~3);
  for (let i = offset; i < end; i += 4) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- uint32 wrapping, not truncation
    sum = (sum + buf.readUInt32BE(i)) >>> 0;
  }
  return sum;
}

export function applySafariFix(ttfBuffer: Buffer): Buffer {
  const buf = Buffer.from(ttfBuffer);

  const os2 = findTable(buf, "OS/2");
  const hhea = findTable(buf, "hhea");

  if (!os2 || !hhea) {
    return buf;
  }

  const os2Version = buf.readUInt16BE(os2.offset);
  if (os2Version < 1) {
    return buf;
  }

  // Patch OS/2.fsType = 0
  buf.writeInt16BE(0, os2.offset + OS2_FSTYPE);

  // Patch OS/2.fsSelection |= USE_TYPO_METRICS
  const fsSelection = buf.readUInt16BE(os2.offset + OS2_FSSELECTION);
  buf.writeUInt16BE(fsSelection | USE_TYPO_METRICS, os2.offset + OS2_FSSELECTION);

  // Read sTypo values for hhea sync
  const sTypoAscender = buf.readInt16BE(os2.offset + OS2_STYPO_ASCENDER);
  const sTypoDescender = buf.readInt16BE(os2.offset + OS2_STYPO_DESCENDER);
  const sTypoLineGap = buf.readInt16BE(os2.offset + OS2_STYPO_LINEGAP);

  // Patch hhea to match OS/2 sTypo values
  buf.writeInt16BE(sTypoAscender, hhea.offset + HHEA_ASCENT);
  buf.writeInt16BE(sTypoDescender, hhea.offset + HHEA_DESCENT);
  buf.writeInt16BE(sTypoLineGap, hhea.offset + HHEA_LINEGAP);

  // Recalculate checksums
  const os2Checksum = calcTableChecksum(buf, os2.offset, os2.length);
  buf.writeUInt32BE(os2Checksum, os2.entryOffset + 4);

  const hheaChecksum = calcTableChecksum(buf, hhea.offset, hhea.length);
  buf.writeUInt32BE(hheaChecksum, hhea.entryOffset + 4);

  return buf;
}
