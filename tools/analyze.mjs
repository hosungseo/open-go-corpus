#!/usr/bin/env node
// Corpus analytics over the collected open.go.kr rows.
//
// The point of the corpus: approved documents carry a second-precision
// production timestamp (PRDCTN_DT), so tracing one project's documents in
// order yields the real elapsed time between procedural steps — the empirical
// duration the warroom has been estimating from statutory deadlines.
//
//   node tools/analyze.mjs summary
//   node tools/analyze.mjs lifecycle "화순 생물의약"
//   node tools/analyze.mjs steps          # median gap per procedure type
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = process.env.CORPUS_DIR ? path.join(ROOT, process.env.CORPUS_DIR) : path.join(ROOT, "curated");

function* rows(dir = RAW) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { yield* rows(p); continue; }
    if (!e.endsWith(".jsonl")) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { yield JSON.parse(line); } catch { /* partial write */ }
    }
  }
}
const dt = (r) => (r.PRDCTN_DT || "").slice(0, 8);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const uniqKey = (r) => `${r.INSTT_CD || ""}|${r.DOC_NO || ""}|${r.PRDCTN_DT || ""}`;

const cmd = process.argv[2] || "summary";
const argText = process.argv.slice(3).join(" ");

/* ── load + dedupe (query and daily sweeps overlap heavily) ── */
const all = new Map();
for (const r of rows()) all.set(uniqKey(r), r);
const docs = [...all.values()];
console.log(`corpus: ${docs.length.toLocaleString()} unique documents\n`);

if (cmd === "summary") {
  const years = {}, insts = {}, depts = {}, units = {};
  docs.forEach((r) => {
    years[dt(r).slice(0, 4)] = (years[dt(r).slice(0, 4)] || 0) + 1;
    insts[r.PROC_INSTT_NM] = (insts[r.PROC_INSTT_NM] || 0) + 1;
    depts[`${r.PROC_INSTT_NM} ${r.CHRG_DEPT_NM}`] = (depts[`${r.PROC_INSTT_NM} ${r.CHRG_DEPT_NM}`] || 0) + 1;
    if (r.UNIT_JOB_NM) units[r.UNIT_JOB_NM] = (units[r.UNIT_JOB_NM] || 0) + 1;
  });
  const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log("연도별:", top(years, 14).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · "));
  console.log("\n기관 상위:");
  top(insts).forEach(([k, v]) => console.log(`  ${String(v).padStart(6)} ${k}`));
  console.log("\n단위과제(BRM) 상위:");
  top(units).forEach(([k, v]) => console.log(`  ${String(v).padStart(6)} ${k}`));
  const withFile = docs.filter((r) => r.FILE_ID).length;
  console.log(`\n첨부파일 보유: ${withFile.toLocaleString()} (${(withFile / docs.length * 100).toFixed(1)}%)`);
}

if (cmd === "lifecycle") {
  const hits = docs
    .filter((r) => (r.INFO_SJ || "").includes(argText))
    .sort((a, b) => (a.PRDCTN_DT || "").localeCompare(b.PRDCTN_DT || ""));
  console.log(`"${argText}" 문서 ${hits.length}건\n`);
  let prev = null;
  hits.forEach((r) => {
    const d = dt(r);
    const gap = prev
      ? Math.round((new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`) -
          new Date(`${prev.slice(0, 4)}-${prev.slice(4, 6)}-${prev.slice(6, 8)}`)) / 864e5)
      : 0;
    console.log(`  ${d} ${gap ? `(+${gap}일)`.padStart(9) : "".padStart(9)} ${r.PROC_INSTT_NM}/${r.CHRG_DEPT_NM} :: ${(r.INFO_SJ || "").slice(0, 70)}`);
    prev = d;
  });
  if (hits.length >= 2) {
    const span = Math.round((new Date(dt(hits.at(-1)).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) -
      new Date(dt(hits[0]).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))) / 864e5);
    console.log(`\n  전체 기간: ${span}일 (${dt(hits[0])} → ${dt(hits.at(-1))})`);
  }
}

if (cmd === "duration") {
  // Same-day 검토보고→승인→고시 chains show that the paperwork of one
  // decision is signed together; the real waiting shows up across a project's
  // whole life. Measure that span per procedure family — this is the number
  // the warroom needs to replace its statutory-deadline estimates.
  const FAMILY = [
    ["산업단지계획", /산업단지계획|산업단지\s*(개발|지정)/],
    ["환경영향평가", /환경영향평가/],
    ["재해영향평가", /재해영향평가|사전재해/],
    ["교통영향평가", /교통영향평가/],
    ["도시관리계획", /도시관리계획|지구단위계획|도시계획\s*결정/],
    ["실시계획", /실시계획/],
    ["사업인정·보상", /사업인정|보상계획|수용재결|손실보상/],
    ["공장설립·건축", /공장설립|건축허가|사용승인|준공검사/],
    ["전력·에너지", /전원개발|송전|변전소|전력계통|집단에너지/],
    ["용수·하수", /공업용수|수도사업|하수도|폐수처리/],
    ["개발제한·용도", /개발제한구역|용도지역|용도폐지|형질변경/],
    ["국유재산·부지", /국유재산|공유재산|기부\s*대\s*양여|종전부지/],
  ];
  const famOf = (t) => (FAMILY.find(([, re]) => re.test(t)) ?? [null])[0];

  const PROC_WORDS = /(계획\s*)?(변경|수립|결정)?\s*(승인|인가|허가|지정|고시|공고|협의|심의|의결|신청|제출|요청|회신|알림|통보|보고|검토|의뢰|개최|공람|열람|접수|반려|취소|연장|착수|준공|완료|결과|추진|시행|이행|검사|점검|조사|평가)\s*/g;
  const projectKey = (t) => {
    const br = t.match(/[\[［]([^\]］]{6,40})[\]］]/);
    if (br) return br[1].replace(/\s+/g, " ").trim();
    let s = t.replace(/[\(（][^)）]*[\)）]/g, " ").replace(/\d+차|\d+회|제\d+호/g, " ")
             .replace(PROC_WORDS, " ").replace(/\s+/g, " ").trim();
    const toks = s.split(" ").filter(Boolean).slice(0, 5);
    return toks.join(" ").length >= 6 ? toks.join(" ") : null;
  };
  const clusters = new Map();
  docs.forEach((r) => {
    const t = r.INFO_SJ || "";
    const k = projectKey(t);
    const fam = famOf(t);
    if (!k || !fam) return;
    const ck = `${fam}|${k}`;
    if (!clusters.has(ck)) clusters.set(ck, { fam, key: k, days: [], insts: new Set(), titles: [] });
    const c = clusters.get(ck);
    c.days.push(dt(r));
    c.insts.add(r.PROC_INSTT_NM);
    if (c.titles.length < 3) c.titles.push(t.slice(0, 50));
  });
  const spans = {};
  const examples = {};
  [...clusters.values()].forEach((c) => {
    const ds = [...new Set(c.days)].filter(Boolean).sort();
    if (ds.length < 2) return;
    const toDate = (d) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
    const span = Math.round((toDate(ds.at(-1)) - toDate(ds[0])) / 864e5);
    if (span <= 0 || span > 3000) return;
    (spans[c.fam] = spans[c.fam] || []).push(span);
    if (span > 60 && (!examples[c.fam] || examples[c.fam].span < span)) {
      examples[c.fam] = { span, key: c.key, docs: ds.length, from: ds[0], to: ds.at(-1) };
    }
  });
  console.log("절차군별 사업 생애주기 실측 (문서 최초→최종, 중앙값):\n");
  console.log("  절차군            중앙값   평균   최대   사업수");
  Object.entries(spans).sort((a, b) => b[1].length - a[1].length).forEach(([fam, v]) => {
    const avg = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    console.log(`  ${fam.padEnd(16)} ${String(median(v)).padStart(5)}일 ${String(avg).padStart(5)}일 ${String(Math.max(...v)).padStart(5)}일  n=${v.length}`);
  });
  console.log("\n최장 사례:");
  Object.entries(examples).forEach(([fam, e]) =>
    console.log(`  ${fam.padEnd(16)} ${String(e.span).padStart(4)}일  ${e.from}→${e.to} 문서${e.docs}건  ${e.key.slice(0, 40)}`));
}

if (cmd === "steps") {
  // Group documents by project name in brackets — the portal convention is
  // "…검토보고[사업명]" — then measure gaps between successive step types.
  const STEP = [
    ["협의요청", /협의\s*요청|의견\s*조회/], ["협의회신", /협의.*(회신|알림|통보)|의견\s*제출/],
    ["검토보고", /검토\s*보고/], ["심의", /심의|의결/],
    ["승인", /승인/], ["고시의뢰", /고시\s*의뢰|공보\s*게재/], ["고시", /고시|공고/],
  ];
  const stepOf = (t) => (STEP.find(([, re]) => re.test(t)) ?? [null])[0];

  // Cluster documents by the project they concern. A bracketed name is the
  // clean case; otherwise strip the procedural verbs and modifiers off the
  // title and keep the leading noun phrase, which is the project itself:
  //   "화순 생물의약 제2일반산업단지계획 변경 승인 검토보고" → "화순 생물의약 제2일반산업단지"
  const PROC_WORDS = /(계획\s*)?(변경|수립|결정)?\s*(승인|인가|허가|지정|고시|공고|협의|심의|의결|신청|제출|요청|회신|알림|통보|보고|검토|의뢰|개최|공람|열람|접수|반려|취소|연장|착수|준공|완료|결과|추진|시행|이행|검사|점검|조사|평가)\s*/g;
  const TRAILING = /[\s·,]*(및|등|안|\(안\)|관련|대한|위한|따른)[\s·,]*$/g;
  const projectKey = (t) => {
    const br = t.match(/[\[［]([^\]］]{6,40})[\]］]/);
    if (br) return br[1].replace(/\s+/g, " ").trim();
    let s = t.replace(/[\(（][^)）]*[\)）]/g, " ")     // drop parentheticals
             .replace(/\d+차|\d+회|제\d+호/g, " ")
             .replace(PROC_WORDS, " ")
             .replace(/\s+/g, " ").trim();
    for (let i = 0; i < 3; i++) s = s.replace(TRAILING, "").trim();
    const toks = s.split(" ").filter(Boolean).slice(0, 5);
    const key = toks.join(" ");
    return key.length >= 6 ? key : null;
  };

  const projects = new Map();
  docs.forEach((r) => {
    const t = r.INFO_SJ || "";
    const key = projectKey(t);
    if (!key) return;
    if (!projects.has(key)) projects.set(key, []);
    projects.get(key).push({ d: dt(r), step: stepOf(t), t, inst: r.PROC_INSTT_NM });
  });
  const gaps = {};
  let traced = 0;
  [...projects.entries()].forEach(([name, list]) => {
    if (list.length < 2) return;
    traced++;
    list.sort((a, b) => a.d.localeCompare(b.d));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (!a.step || !b.step || a.step === b.step) continue;
      const g = Math.round((new Date(b.d.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) -
        new Date(a.d.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))) / 864e5);
      if (g < 0 || g > 900) continue;
      const k = `${a.step}→${b.step}`;
      (gaps[k] = gaps[k] || []).push(g);
    }
  });
  console.log(`괄호 사업명으로 묶인 사업 ${projects.size.toLocaleString()}건, 2건 이상 추적 ${traced.toLocaleString()}건\n`);
  console.log("단계 전이별 실측 소요일 (중앙값, n=표본):");
  Object.entries(gaps).filter(([, v]) => v.length >= 3)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 20)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${String(median(v)).padStart(4)}일  n=${v.length}`));
}
