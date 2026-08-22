#!/usr/bin/env node
// Separates procedural signal from administrative housekeeping.
//
// A blanket day-sweep of open.go.kr is ~95% payroll, petty cash, contracts,
// school programmes and library events. None of that says anything about how
// a permitting procedure moves. This scores every row and keeps only the
// documents that sit on an actual administrative procedure.
//
//   node tools/curate.mjs --report          # score distribution, no writes
//   node tools/curate.mjs --write           # write curated/ + drop raw daily
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "raw");
const OUT = path.join(ROOT, "curated");
const WRITE = process.argv.includes("--write");
const DROP = process.argv.includes("--drop-raw");

/* ── noise: routine internal administration ─────────────────────────────
   Matched on BRM unit task first (most reliable), then on title. */
const NOISE_UNIT = /예산|회계|일상경비|지출|계약관리|사무지원|급여|여비|세입|세출|물품|자산관리|당직|복무|후생|급식|통계관리|민원처리|문서관리|정보화장비|청사관리|차량관리/;
const NOISE_TITLE = /지출결의|지급\s*요청|정산|여비|출장비|급여|수당|물품\s*(구입|구매)|사무용품|소모품|청소|경비\s*지출|일상경비|카드\s*사용|계좌|송금|입금|납부|반납|기부금품|간담회\s*비용|다과|식대|연수\s*(운영|결과)|교육\s*프로그램|독서|도서\s*구입|동아리|체험학습|방과후|급식|위생점검|당직|근무상황|복무|연가|출근|채용\s*공고|시간강사|기간제|자원봉사|표창|기념품|현수막|홍보물\s*제작/;

/* ── signal: the procedural vocabulary the warroom models ─────────────── */
const STRONG = /실시계획|사업계획\s*승인|산업단지계획|개발계획|지구단위계획|도시관리계획|환경영향평가|전략환경영향평가|재해영향평가|교통영향평가|사전재해|기후변화영향평가|에너지사용계획|사업인정|보상계획|수용재결|용도폐지|공유수면|농지전용|산지전용|점용허가|공장설립|건축허가|사용승인|준공검사|가동개시|통합환경|배출시설|위험물|고압가스|전력계통|전원개발|송전선로|변전소|공업용수|수도사업|하수도|폐수|택지개발|기반시설|지형도면|의제\s*협의|인허가|일괄협의|통합심의|예비타당성|타당성조사|투자심사|중기지방재정|국고보조|특별회계|기금운용/;
const MEDIUM = /승인|인가|허가|지정|고시|공고|협의\s*(요청|회신|의견)|심의|의결|자문|검토\s*보고|추진\s*계획|기본계획|용역\s*(발주|착수|준공)|입찰|현장\s*조사|주민\s*(설명회|의견|공람)|공청회|이의신청|재심의|변경\s*승인/;

/* Institutions whose ordinary output is procedure, not schooling. */
const INST_BOOST = /부$|처$|청$|위원회$|공사$|공단$|시$|도$|특별시|광역시|특별자치/;
const INST_PENALTY = /교육청|교육지원청|학교|대학교|유치원|도서관|박물관|문화원|평생학습/;

function score(r) {
  const title = `${r.INFO_SJ || ""}`;
  const unit = `${r.UNIT_JOB_NM || ""}`;
  const inst = `${r.PROC_INSTT_NM || ""}`;
  const dept = `${r.CHRG_DEPT_NM || ""}`;
  let s = 0;
  if (STRONG.test(title)) s += 5;
  if (MEDIUM.test(title)) s += 2;
  if (STRONG.test(unit)) s += 2;
  if (NOISE_UNIT.test(unit)) s -= 4;
  if (NOISE_TITLE.test(title)) s -= 5;
  if (INST_PENALTY.test(inst) || INST_PENALTY.test(dept)) s -= 2;
  else if (INST_BOOST.test(inst)) s += 1;
  // A bracketed project name is the portal's convention for project work,
  // and it is what makes lifecycle tracing possible.
  if (/[\[［][^\]］]{6,40}[\]］]/.test(title)) s += 2;
  return s;
}

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

const KEEP = 3;                       // score >= KEEP is kept
const stats = { total: 0, kept: 0, byBucket: {}, keptByYear: {}, dropSamples: [], keepSamples: [] };
const seen = new Set();
if (WRITE) mkdirSync(OUT, { recursive: true });

for (const f of files(RAW)) {
  const rel = path.relative(RAW, f);
  const isQuery = rel.includes("-query");
  const keep = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    stats.total++;
    const key = `${r.INSTT_CD || ""}|${r.DOC_NO || ""}|${r.PRDCTN_DT || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = score(r);
    const bucket = s >= 7 ? "7+" : s >= KEEP ? "3-6" : s >= 0 ? "0-2" : "음수";
    stats.byBucket[bucket] = (stats.byBucket[bucket] || 0) + 1;
    // Query-mode rows were fetched by a procedure keyword, so they clear a
    // lower bar; day-sweep rows must earn their place.
    if (s >= (isQuery ? 1 : KEEP)) {
      keep.push(line);
      stats.kept++;
      const y = (r.PRDCTN_DT || "").slice(0, 4);
      stats.keptByYear[y] = (stats.keptByYear[y] || 0) + 1;
      if (stats.keepSamples.length < 6 && s >= 7) stats.keepSamples.push(`[${s}] ${r.PROC_INSTT_NM}/${r.CHRG_DEPT_NM} :: ${(r.INFO_SJ || "").slice(0, 62)}`);
    } else if (stats.dropSamples.length < 6 && !isQuery) {
      stats.dropSamples.push(`[${s}] ${r.PROC_INSTT_NM}/${r.CHRG_DEPT_NM} :: ${(r.INFO_SJ || "").slice(0, 62)}`);
    }
  }
  if (WRITE && keep.length) {
    const dest = path.join(OUT, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, keep.join("\n") + "\n");
  }
}

const pct = (n) => `${(n / stats.total * 100).toFixed(1)}%`;
console.log(`전체 ${stats.total.toLocaleString()}건 (중복 제외 ${seen.size.toLocaleString()})`);
console.log(`점수 분포: ${Object.entries(stats.byBucket).sort().map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ")}`);
console.log(`보존 ${stats.kept.toLocaleString()} (${pct(stats.kept)}) → 폐기 ${(seen.size - stats.kept).toLocaleString()}`);
console.log(`연도별 보존: ${Object.entries(stats.keptByYear).sort().map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ")}`);
console.log(`\n남기는 예:`); stats.keepSamples.forEach((s) => console.log(`  ${s}`));
console.log(`\n버리는 예:`); stats.dropSamples.forEach((s) => console.log(`  ${s}`));
if (WRITE) {
  console.log(`\ncurated/ 기록 완료`);
  if (DROP) {
    rmSync(path.join(RAW, "orginl"), { recursive: true, force: true });
    console.log("raw/orginl (일별 전수) 삭제 — curated 사본 보존");
  }
} else {
  console.log(`\n(--write 로 curated/ 기록, --drop-raw 로 원본 일별전수 삭제)`);
}
