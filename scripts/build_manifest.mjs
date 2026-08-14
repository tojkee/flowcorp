import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Read-only catalog builder. The art pack in src/assets is hand-authored and is
// the source of truth, so this script NEVER writes or modifies image files — it
// only scans them and rewrites asset_manifest.json to match what is on disk.

const ROOT = new URL("..", import.meta.url).pathname;
const ASSETS = join(ROOT, "src/assets");

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
    } else if (entry.toLowerCase().endsWith(".png")) {
      const rel = relative(ROOT, full).split("\\").join("/");
      const parts = relative(ASSETS, full).split("\\").join("/").split("/");
      assets.push({
        name: entry,
        path: rel,
        category: parts.length > 1 ? parts[0] : "root",
        dimensions: readPngSize(full),
      });
    }
  }
}

function readPngSize(file) {
  const buffer = readFileSync(file);
  // PNG: 8-byte signature, then IHDR chunk with width@16 and height@20 (BE uint32).
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return "unknown";
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}
