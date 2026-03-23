export function findTable(ttf: Buffer, tag: string): { offset: number; length: number } | null {
  const numTables = ttf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const entryOffset = 12 + i * 16;
    const tableTag = ttf.toString("ascii", entryOffset, entryOffset + 4);
    if (tableTag === tag) {
      return {
        offset: ttf.readUInt32BE(entryOffset + 8),
        length: ttf.readUInt32BE(entryOffset + 12),
      };
    }
  }
  return null;
}

export function readOS2(ttf: Buffer) {
  const table = findTable(ttf, "OS/2");
  if (!table) throw new Error("OS/2 table not found");
  const t = table.offset;
  return {
    version: ttf.readUInt16BE(t),
    fsType: ttf.readInt16BE(t + 8),
    fsSelection: ttf.readUInt16BE(t + 62),
    sTypoAscender: ttf.readInt16BE(t + 68),
    sTypoDescender: ttf.readInt16BE(t + 70),
    sTypoLineGap: ttf.readInt16BE(t + 72),
  };
}

export function readHhea(ttf: Buffer) {
  const table = findTable(ttf, "hhea");
  if (!table) throw new Error("hhea table not found");
  const t = table.offset;
  return {
    ascent: ttf.readInt16BE(t + 4),
    descent: ttf.readInt16BE(t + 6),
    lineGap: ttf.readInt16BE(t + 8),
  };
}
