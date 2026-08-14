import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Read-only catalog builder. The art pack in src/assets is hand-authored and is
// the source of truth, so this script NEVER writes or modifies image files — it
// only scans them and rewrites asset_manifest.json to match what is on disk.

const ROOT = new URL("..", import.meta.url).pathname;
const ASSETS = join(ROOT, "src/assets");
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

const assets = [];
walk(ASSETS);
assets.sort((a, b) => a.path.localeCompare(b.path));

writeFileSync(
  join(ROOT, "asset_manifest.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "src/assets (hand-authored, source of truth)", assets }, null, 2)}\n`,
);

console.log(`Catalogued ${assets.length} assets into asset_manifest.json`);

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (IMAGE_EXTENSIONS.some((extension) => entry.toLowerCase().endsWith(extension))) {
      const rel = relative(ROOT, full).split("\\").join("/");
      const parts = relative(ASSETS, full).split("\\").join("/").split("/");
      assets.push({
        name: entry,
        path: rel,
        category: parts.length > 1 ? parts[0] : "root",
        dimensions: readImageSize(full),
      });
    }
  }
}

// Sprites are PNG; the office backgrounds ship as JPEG (they are alpha-free and
// far too heavy as PNG), so the catalog reads both.
function readImageSize(file) {
  const buffer = readFileSync(file);
  return readPngSize(buffer) ?? readJpegSize(buffer) ?? "unknown";
}

function readPngSize(buffer) {
  // PNG: 8-byte signature, then IHDR chunk with width@16 and height@20 (BE uint32).
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

function readJpegSize(buffer) {
  // JPEG: walk the marker segments to the first frame header (SOFn), whose
  // payload carries height@5 and width@7 (BE uint16).
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return `${buffer.readUInt16BE(offset + 7)}x${buffer.readUInt16BE(offset + 5)}`;
    }
    offset += 2 + length;
  }
  return null;
}
