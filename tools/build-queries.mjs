#!/usr/bin/env node
// Builds the keyword list for `collect.mjs --mode query` out of the korea100
// data, so the corpus covers exactly the procedures the warroom models.
//
// Four keyword families:
//   project   — the mega projects themselves (direct evidence of progress)
//   milestone — milestone names, trimmed to their searchable procedural core
//   procedure — statutory step names from the linked institutions
//   institution — institution titles (the 제도 catalogue)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const K100 = path.join(process.env.HOME, "korea100", "web", "data");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const out = new Map();                   // query → {q, family, note}
const add = (q, family, note) => {
  const key = q.trim();
  if (key.length < 4 || key.length > 28) return;
  if (!out.has(key)) out.set(key, { q: key, family, note });
};

/* project-level seeds — hand-written, these are what "direct hit" means */
[
  ["광주 군공항", "gwangju"], ["군공항 이전", "gwangju"], ["종전부지", "gwangju"],
  ["전남광주 반도체", "gwangju"], ["광주 반도체", "gwangju"], ["반도체 클러스터", "gwangju"],
  ["반도체 특화단지", "gwangju"], ["국가첨단전략산업", "gwangju"],
  ["예비이전후보지", "gwangju"], ["기부 대 양여", "gwangju"],
  ["초광역권발전계획", "fpts"], ["특별지방자치단체", "fpts"], ["지방시대위원회", "fpts"],
  ["초광역협력", "fpts"], ["지역균형발전", "fpts"], ["기회발전특구", "fpts"],
  ["교육발전특구", "fpts"], ["도심융합특구", "fpts"],
].forEach(([q, note]) => add(q, "project", note));

/* milestone + procedure names from the mega projects */
const projDir = path.join(K100, "mega-projects", "projects");
const instCache = new Map();
const inst = (slug) => {
  if (!instCache.has(slug)) {
    try { instCache.set(slug, read(path.join(K100, "institutions", `${slug}.json`))); }
    catch { instCache.set(slug, null); }
  }
  return instCache.get(slug);
};

// Milestone names bundle several steps with 중점/·; split and keep the parts
// that read like a procedure ("...승인", "...협의", "...고시").
const TAIL = /(승인|허가|인가|지정|고시|공고|협의|심의|의결|신고|등록|검사|평가|보상|수립|신청|결정|확정|통보|점검|준공|착공)$/;
const splitName = (name) =>
  name.split(/[·,\/]|\s+및\s+|\s+등\s+/).map((s) => s.trim()).filter(Boolean);

for (const f of readdirSync(projDir).filter((f) => f.endsWith(".json"))) {
  const project = read(path.join(projDir, f));
  const tag = project.id.slice(0, 12);
  project.nodes.forEach((ms) => {
    splitName(ms.name).forEach((part) => {
      if (TAIL.test(part)) add(part, "milestone", `${tag}:${ms.id}`);
    });
    (ms.templateRefs ?? []).forEach((ref) => {
      const t = inst(ref.institution);
      if (t?.name) add(t.name, "institution", ref.institution);
      const ids = ref.nodeIds ? new Set(ref.nodeIds) : null;
      (t?.process?.nodes ?? []).forEach((n) => {
        if (ids && !ids.has(n.id)) return;
        splitName(n.name).forEach((part) => {
          if (TAIL.test(part)) add(part, "procedure", `${ref.institution}:${n.id}`);
        });
      });
    });
  });
}

const list = [...out.values()];
const byFamily = list.reduce((a, x) => ((a[x.family] = (a[x.family] || 0) + 1), a), {});
writeFileSync(path.join(ROOT, "queries.meta.json"), JSON.stringify(list, null, 1));
writeFileSync(path.join(ROOT, "queries.json"), JSON.stringify(list.map((x) => x.q), null, 1));
console.log(`queries: ${list.length}`, byFamily);
console.log("sample:", list.slice(0, 8).map((x) => x.q).join(" / "));
