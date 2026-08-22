#!/usr/bin/env node
// Table analytics over the HWP-family bodies.
//
// PDF gives you a rendered page; HWP/HWPX give you the table cells. rhwp's
// export-tables recovers them as row/col structures, and those tables carry
// the substance a narrative summary leaves out — above all the
// 협의의견 → 조치계획 → 반영여부 grid, which is the actual friction record of
// a permitting procedure: who objected, what the applicant did about it,
// whether it was accepted.
//
//   node tools/analyze-tables.mjs kinds        # what table types exist
//   node tools/analyze-tables.mjs consult      # consultation demands
//   node tools/analyze-tables.mjs land         # land schedules (보상 대상)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = readFileSync(path.join(ROOT, "bodies", "bodies.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const cmd = process.argv[2] || "kinds";
const norm = (s) => (s || "").replace(/\s+/g, "").trim();

// Table kinds, matched on the header row.
const KINDS = [
  ["협의의견-조치계획", /(협의의견|검토\(보완\)의견|검토의견).*(조치계획)/],
  ["검토항목-결과", /검토항목.*검토결과|검토사항.*검토내용/],
  ["토지조서", /(소재지|지번).*(지목).*(면적)/],
  ["시설명세", /(시설명|시설의종류).*(위치|면적)/],
  ["변경내역", /변경내용.*변경사유|기정.*변경/],
  ["법정요건", /(법명|법률명|관계법령).*(검토조항|검토결과)/],
  ["구역·면적", /구역명.*면적|도면표시번호/],
  ["사업개요", /(사업명|사업기간|사업비|시행자)/],
];
const kindOf = (head) => (KINDS.find(([, re]) => re.test(norm(head))) ?? [null])[0];

function* tables() {
  for (const r of rows) {
    for (const t of r.tables || []) {
      const cells = (t.cells || []).map((c) => (c || "").trim());
      if (!cells.length) continue;
      const cols = t.cols || 1;
      yield { r, t, cells, cols, head: cells.slice(0, Math.min(cols, 6)).join(" | ") };
    }
  }
}

if (cmd === "kinds") {
  const counts = {}, docs = {};
  let total = 0;
  for (const { r, head } of tables()) {
    total++;
    const k = kindOf(head) || "기타";
    counts[k] = (counts[k] || 0) + 1;
    (docs[k] = docs[k] || new Set()).add(r.id);
  }
  console.log(`표 ${total.toLocaleString()}개 · 문서 ${rows.length}건\n`);
  console.log("표 유형        표수   문서수");
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(5)} ${String(docs[k].size).padStart(6)}`));
}

if (cmd === "consult") {
  // What agencies actually demand, and whether the demand is substantive.
  const NONE = /^(의견\s*없|해당\s*없|없\s*음|미해당|-|없다)/;
  const TOPICS = [
    ["법령 준수", /제\d+조|법률|법령|규정에\s*따라|준수/],
    ["환경·녹지", /녹지|수목|환경|소음|오염|생태|경관|폐기물/],
    ["교통", /교통|도로|주차|진출입|보도|차로/],
    ["안전·재해", /재해|안전|소방|방재|침수|사면|급경사/],
    ["상하수도", /상수도|하수|용수|배수|정화조/],
    ["추가 협의 요구", /별도\s*협의|협의\s*필요|사전\s*협의|재협의/],
    ["비용 부담", /비용|부담|분담|사업비|원인자/],
    ["보완·재제출", /보완|재제출|추가\s*제출|미비/],
  ];
  const topic = {}, none = { y: 0, n: 0 }, byDept = {};
  const DEPT = /(과|국|본부|단|실|청|소|원|공사|공단|위원회)$/;
  let grids = 0;
  for (const { t, cells, cols, head } of tables()) {
    if (kindOf(head) !== "협의의견-조치계획") continue;
    grids++;
    const body = cells.slice(cols);
    for (let i = 0; i < body.length; i += cols) {
      const row = body.slice(i, i + cols);
      if (row.length < 2) continue;
      const dept = row[0].replace(/\n/g, "").trim();
      const op = row.slice(1, 3).join(" ");
      if (!op.trim()) continue;
      if (NONE.test(op.trim())) { none.y++; continue; }
      none.n++;
      if (dept && dept.length < 24 && DEPT.test(dept)) byDept[dept] = (byDept[dept] || 0) + 1;
      for (const [k, re] of TOPICS) if (re.test(op)) topic[k] = (topic[k] || 0) + 1;
    }
  }
  const tot = none.y + none.n;
  console.log(`협의의견 표 ${grids}개 · 응답 ${tot.toLocaleString()}건`);
  console.log(`  의견없음 ${none.y} (${(none.y / tot * 100).toFixed(0)}%) · 실질의견 ${none.n} (${(none.n / tot * 100).toFixed(0)}%)\n`);
  console.log("요구 내용 유형:");
  Object.entries(topic).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} ${k}`));
  console.log("\n의견 낸 부서 상위 15:");
  Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} ${k}`));
}

if (cmd === "land") {
  // Land schedules state the compensation footprint parcel by parcel.
  let parcels = 0, area = 0, docs = new Set();
  const jimok = {};
  for (const { r, cells, cols, head } of tables()) {
    if (kindOf(head) !== "토지조서") continue;
    docs.add(r.id);
    const body = cells.slice(cols);
    for (let i = 0; i < body.length; i += cols) {
      const row = body.slice(i, i + cols);
      const areaCell = row.find((c) => /^[\d,]+(\.\d+)?$/.test(c.replace(/\s/g, "")));
      const jm = row.find((c) => /^(전|답|대|임야|잡종지|도로|구거|하천|과수원|목장용지|공장용지|학교용지|주차장|창고용지|철도용지|제방|유지|수도용지|공원|체육용지|유원지|종교용지|사적지|묘지)$/.test(c.trim()));
      if (areaCell) { parcels++; area += Number(areaCell.replace(/[,\s]/g, "")) || 0; }
      if (jm) jimok[jm.trim()] = (jimok[jm.trim()] || 0) + 1;
    }
  }
  console.log(`토지조서 보유 문서 ${docs.size}건 · 필지 ${parcels.toLocaleString()}개 · 합계 면적 ${Math.round(area).toLocaleString()}㎡ (${(area / 1e6).toFixed(2)}㎢)`);
  console.log("\n지목 분포:");
  Object.entries(jimok).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} ${k}`));
}
