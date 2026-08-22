#!/usr/bin/env node
// Content analytics over the extracted report bodies.
//
//   laws   — statutes cited in the bodies, cross-checked against the korea100
//            institution catalogue (which laws does the model already cover,
//            and which does the paperwork rely on that we never modelled?)
//   scale  — project size (사업비 / 면적) stated in the text
//
//   node tools/analyze-body.mjs laws [--missing]
//   node tools/analyze-body.mjs scale
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const K100 = path.join(process.env.HOME, "korea100", "web", "data");
const rows = readFileSync(path.join(ROOT, "bodies", "bodies.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const cmd = process.argv[2] || "laws";
const squeeze = (s) => s.replace(/\s+/g, "");

if (cmd === "laws") {
  // Korean documents bracket statute names: 「국토의 계획 및 이용에 관한 법률」
  const CITE = /[「｢]([^」｣]{2,40}?)[」｣]\s*(제\s*\d+\s*조(?:의\s*\d+)?)?/g;
  const LAWISH = /(법|법률|규정|조례|규칙|지침|고시)$/;
  const cited = new Map();   // law → {hits, docs:Set, articles:Set}
  for (const r of rows) {
    for (const m of (r.text || "").matchAll(CITE)) {
      const nm = squeeze(m[1]);
      if (!LAWISH.test(nm)) continue;
      if (!cited.has(nm)) cited.set(nm, { hits: 0, docs: new Set(), articles: new Set() });
      const e = cited.get(nm);
      e.hits++; e.docs.add(r.id);
      if (m[2]) e.articles.add(squeeze(m[2]));
    }
  }

  // What korea100 already models: every statute named in any institution's
  // legal_basis, plus the mega-project templates.
  const modelled = new Map();  // squeezed name → original
  const instDir = path.join(K100, "institutions");
  if (existsSync(instDir)) {
    for (const f of readdirSync(instDir).filter((f) => f.endsWith(".json"))) {
      const j = JSON.parse(readFileSync(path.join(instDir, f), "utf8"));
      const add = (law) => { if (law) modelled.set(squeeze(law), law.trim()); };
      (j.canvas?.legalBasis ?? []).forEach((e) => add(e?.law ?? e?.name));
      (j.process?.nodes ?? []).forEach((n) => {
        const lb = Array.isArray(n.legal_basis) ? n.legal_basis : n.legal_basis ? [n.legal_basis] : [];
        lb.forEach((e) => add(e?.law));
      });
    }
  }
  // Alias: documents often shorten 국토의계획및이용에관한법률 → 국토계획법 etc.
  const alias = (n) => n
    .replace(/^국토계획법$/, "국토의계획및이용에관한법률")
    .replace(/^산집법$/, "산업집적활성화및공장설립에관한법률")
    .replace(/^산입법$/, "산업입지및개발에관한법률")
    .replace(/시행령$|시행규칙$/, "");
  const isModelled = (n) => modelled.has(n) || modelled.has(alias(n));

  const list = [...cited.entries()].sort((a, b) => b[1].docs.size - a[1].docs.size);
  const covered = list.filter(([n]) => isModelled(n));
  const missing = list.filter(([n]) => !isModelled(n));
  console.log(`본문 인용 법령 ${cited.size}종 · 총 ${[...cited.values()].reduce((a, e) => a + e.hits, 0).toLocaleString()}회`);
  console.log(`korea100 제도 데이터 수록 법령 ${modelled.size}종`);
  console.log(`  대조: 이미 모델링 ${covered.length}종 · 미수록 ${missing.length}종\n`);

  if (process.argv.includes("--missing")) {
    console.log("문서에는 나오는데 korea100에 없는 법령 (문서수 상위 25):");
    missing.slice(0, 25).forEach(([n, e]) =>
      console.log(`  ${String(e.docs.size).padStart(3)}건 ${String(e.hits).padStart(4)}회  ${n}${e.articles.size ? `  [${[...e.articles].slice(0, 3).join(",")}]` : ""}`));
  } else {
    console.log("모델링된 법령 중 실제 문서에서 가장 많이 쓰이는 것 (문서수 상위 15):");
    covered.slice(0, 15).forEach(([n, e]) =>
      console.log(`  ${String(e.docs.size).padStart(3)}건 ${String(e.hits).padStart(4)}회  ${n}`));
    console.log("\n(--missing 으로 미수록 법령 확인)");
  }
}

if (cmd === "scale") {
  // Money and area as written in the reports.
  const MONEY = /(?:총\s*)?사업비[^0-9]{0,12}([\d,]+(?:\.\d+)?)\s*(억|백만|천만|만|원)/g;
  const AREA = /(?:면\s*적|사업\s*면적|부지\s*면적)[^0-9]{0,12}([\d,]+(?:\.\d+)?)\s*(㎡|m2|평|ha|㏊|k㎡)/g;
  const toWon = (v, unit) => {
    const n = Number(v.replace(/,/g, ""));
    return unit === "억" ? n * 1e8 : unit === "백만" ? n * 1e6 : unit === "천만" ? n * 1e7 : unit === "만" ? n * 1e4 : n;
  };
  const toM2 = (v, unit) => {
    const n = Number(v.replace(/,/g, ""));
    return unit === "평" ? n * 3.3058 : unit === "ha" || unit === "㏊" ? n * 1e4 : unit === "k㎡" ? n * 1e6 : n;
  };
  const money = [], area = [];
  const byFam = {};
  for (const r of rows) {
    const t = r.text || "";
    const ms = [...t.matchAll(MONEY)].map((m) => toWon(m[1], m[2])).filter((v) => v >= 1e8 && v < 1e14);
    const as = [...t.matchAll(AREA)].map((m) => toM2(m[1], m[2])).filter((v) => v >= 100 && v < 1e9);
    if (ms.length) money.push({ id: r.id, fam: r.family, title: r.title, v: Math.max(...ms) });
    if (as.length) area.push({ id: r.id, fam: r.family, title: r.title, v: Math.max(...as) });
    if (ms.length || as.length) {
      const b = (byFam[r.family] = byFam[r.family] || { money: [], area: [] });
      if (ms.length) b.money.push(Math.max(...ms));
      if (as.length) b.area.push(Math.max(...as));
    }
  }
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const eok = (v) => `${Math.round(v / 1e8).toLocaleString()}억`;
  const m2 = (v) => v >= 1e6 ? `${(v / 1e6).toFixed(2)}㎢` : `${Math.round(v).toLocaleString()}㎡`;
  console.log(`사업비 명시 ${money.length}건 · 면적 명시 ${area.length}건 (본문 ${rows.length}건 중)\n`);
  console.log("절차군별 규모 (중앙값):");
  console.log("  절차군            사업비        면적          건수");
  Object.entries(byFam).sort((a, b) => (b[1].money.length + b[1].area.length) - (a[1].money.length + a[1].area.length))
    .forEach(([f, b]) => console.log(
      `  ${f.padEnd(16)} ${(b.money.length ? eok(med(b.money)) : "-").padStart(9)} ${(b.area.length ? m2(med(b.area)) : "-").padStart(12)}  ${b.money.length}/${b.area.length}`));
  console.log("\n최대 사업비:");
  money.sort((a, b) => b.v - a.v).slice(0, 5).forEach((x) => console.log(`  ${eok(x.v).padStart(9)}  [${x.fam}] ${x.title.slice(0, 46)}`));
  console.log("\n최대 면적:");
  area.sort((a, b) => b.v - a.v).slice(0, 5).forEach((x) => console.log(`  ${m2(x.v).padStart(10)}  [${x.fam}] ${x.title.slice(0, 46)}`));
}
