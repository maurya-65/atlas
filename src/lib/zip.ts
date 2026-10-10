import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";

// A minimal zip writer (files stored, not compressed) so Settings can offer the extension and the Claude
// skill as downloads without a zip dependency. The folders are tiny, so compression isn't worth it.

const u16 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255]);
const u32 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);

// Fixed date (1 Jan 2026) so the same files always give the same zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Every file under `dir`, as paths relative to it with forward slashes. Skips caches and hidden files. */
function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name === "__pycache__") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Zip the folder at `dir`. Entry names start with `prefix` (for example "atlas-stock-research/"). */
export function zipFolder(dir: string, prefix = ""): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const rel of listFiles(dir)) {
    const name = Buffer.from(prefix + rel);
    const data = readFileSync(path.join(dir, rel));
    const crc = crc32(data);
    const common = [u16(20), u16(0x0800), u16(0), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    const local = Buffer.concat([u32(0x04034b50), ...common, name, data]);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), ...common, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    parts.push(local);
    offset += local.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(dirBytes.length), u32(offset), u16(0)]);
  return Buffer.concat([...parts, dirBytes, end]);
}
