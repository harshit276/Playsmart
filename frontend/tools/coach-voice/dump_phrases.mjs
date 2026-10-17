// Writes phrases.json ([{id, text}]) from src/ai/coachPhrases.js, for render.py.  usage: node dump_phrases.mjs [out.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { ALL_PHRASES } = await import(pathToFileURL(path.join(here, "../../src/ai/coachPhrases.js")).href);
const out = process.argv[2] || path.join(here, "phrases.json");
fs.writeFileSync(out, JSON.stringify(ALL_PHRASES, null, 1));
console.log(`${ALL_PHRASES.length} phrases -> ${out}`);
