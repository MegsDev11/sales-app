#!/usr/bin/env node
/**
 * Static import/export consistency checker.
 *
 * Verifies that every named import from an "@/..." path resolves to something the
 * target module actually exports. It is not a type checker — it catches the class of
 * error a large refactor produces most often: an export that was renamed, moved or
 * deleted while a call site still imports it.
 *
 * Run:  node scripts/check-imports.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "apps", "supabase", "docs", "public"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function resolveAlias(spec) {
  if (spec === "@megs/shared") return join(ROOT, "packages/shared/src/index.ts");
  if (!spec.startsWith("@/")) return null;
  const base = join(ROOT, spec.slice(2));
  for (const ext of EXTS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTS) {
    const idx = join(base, "index" + ext);
    if (existsSync(idx)) return idx;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return undefined; // alias path that does not resolve at all
}

/** Collect exported names from a module's source. */
function exportsOf(src) {
  const names = new Set();
  const add = (n) => n && names.add(n.trim());

  // export function foo / export const foo / export class / export type / interface / enum
  for (const m of src.matchAll(
    /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class|interface|enum|type)\s+([A-Za-z0-9_$]+)/gm
  )) add(m[1]);

  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of m[1].split(",")) {
      const bits = part.replace(/\btype\b/g, "").trim().split(/\s+as\s+/);
      add(bits[bits.length - 1]);
    }
  }

  // export { a, b } from "./x"  and  export * from "./x"
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) {
      const bits = part.replace(/\btype\b/g, "").trim().split(/\s+as\s+/);
      add(bits[bits.length - 1]);
    }
  }

  if (/export\s+default/.test(src)) add("default");
  if (/export\s+\*\s+from/.test(src)) names.add("*STAR*"); // can re-export anything

  return names;
}

const files = walk(ROOT);
const exportCache = new Map();

function getExports(file) {
  if (!exportCache.has(file)) {
    exportCache.set(file, exportsOf(readFileSync(file, "utf8")));
  }
  return exportCache.get(file);
}

const problems = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1);

  const importRe =
    /import\s+(?:type\s+)?(?:([A-Za-z0-9_$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+[A-Za-z0-9_$]+|([A-Za-z0-9_$]+))?\s*from\s*["']([^"']+)["']/g;

  for (const m of src.matchAll(importRe)) {
    const [, defaultWithBrace, braced, bareDefault, spec] = m;
    if (!spec.startsWith("@/") && spec !== "@megs/shared") continue;

    const target = resolveAlias(spec);
    if (target === undefined) {
      problems.push({ rel, spec, kind: "unresolved-path", name: spec });
      continue;
    }
    if (!target) continue;

    const available = getExports(target);
    if (available.has("*STAR*")) continue;

    const wanted = [];
    if (defaultWithBrace) wanted.push("default");
    if (bareDefault) wanted.push("default");
    if (braced) {
      for (const part of braced.split(",")) {
        const cleaned = part.replace(/\btype\b/g, "").trim();
        if (!cleaned) continue;
        wanted.push(cleaned.split(/\s+as\s+/)[0].trim());
      }
    }

    for (const name of wanted) {
      if (!name) continue;
      if (!available.has(name)) {
        problems.push({
          rel,
          spec,
          kind: "missing-export",
          name,
          target: target.slice(ROOT.length + 1),
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`OK  ${files.length} files scanned, every @/ import resolves to a real export.`);
  process.exit(0);
}

console.log(`${problems.length} problem(s) found:\n`);
for (const p of problems) {
  if (p.kind === "unresolved-path") {
    console.log(`  ${p.rel}\n      cannot resolve module path: ${p.spec}`);
  } else {
    console.log(`  ${p.rel}\n      imports { ${p.name} } from "${p.spec}" -> not exported by ${p.target}`);
  }
}
process.exit(1);
