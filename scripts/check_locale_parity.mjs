import fs from "node:fs";

const en = JSON.parse(fs.readFileSync(new URL("../src/locales/en.json", import.meta.url), "utf8"));
const ru = JSON.parse(fs.readFileSync(new URL("../src/locales/ru.json", import.meta.url), "utf8"));

function flatten(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

const enKeys = new Set(flatten(en));
const ruKeys = new Set(flatten(ru));
const missingInRu = [...enKeys].filter((key) => !ruKeys.has(key));
const missingInEn = [...ruKeys].filter((key) => !enKeys.has(key));

if (missingInRu.length || missingInEn.length) {
  if (missingInRu.length) console.error(`Missing in ru.json:\n${missingInRu.join("\n")}`);
  if (missingInEn.length) console.error(`Missing in en.json:\n${missingInEn.join("\n")}`);
  process.exit(1);
}

console.log(`Locale parity passed (${enKeys.size} keys).`);
