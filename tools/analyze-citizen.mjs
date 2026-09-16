// 분석 노트 ①: 국민이 신청한 정책실명제
// 사용: node tools/analyze-citizen.mjs → notes/citizen.json (수치 정본)
// 원자료: realname/central.jsonl(전수 6,847), realname/detail.jsonl(상세 784)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);

const readJsonl = (p) =>
  fs.readFileSync(R(p), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const cen = readJsonl("realname/central.jsonl");
const det = new Map(readJsonl("realname/detail.jsonl").map((d) => [`${d.gclfCd}|${d.year}`, d]));

// 선정기준은 자유입력이라 문자열로 가른다. 다르게 적은 건은 빠질 수 있다(한계에 명시).
const isCitizen = (c) => { c = c || ""; return c.includes("국민") && (c.includes("신청") || c.includes("제안")); };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const num = (v) => +(v || 0);

const years = [...new Set(cen.map((d) => String(d.year || "").slice(0, 4)))].filter((y) => /^\d{4}$/.test(y)).sort();
const byYear = years.map((y) => {
  const all = cen.filter((d) => String(d.year).slice(0, 4) === y);
  const nat = all.filter((d) => isCitizen(d.slctnStdr));
  const oth = all.filter((d) => !isCitizen(d.slctnStdr));
  const inq = (a) => a.map((d) => num(d.inqCnt));
  const zero = (a) => (a.length ? Math.round((a.filter((x) => x === 0).length / a.length) * 100) : null);
  return {
    year: +y, total: all.length, orgs: new Set(all.map((d) => d.nstNm)).size,
    nat: nat.length, natMedInq: med(inq(nat)), natZero: zero(inq(nat)),
    oth: oth.length, othMedInq: med(inq(oth)), othZero: zero(inq(oth)),
  };
});

const nat = cen.filter((d) => isCitizen(d.slctnStdr));
// 누적 조회수는 오래된 사업일수록 유리하다. 같은 해끼리 견줘 연차를 걷어낸다.
const ratios = byYear.filter((r) => r.nat >= 5 && r.oth).map((r) => r.natMedInq / Math.max(r.othMedInq, 0.5));
const adjusted = ratios.reduce((a, b) => a + b, 0) / ratios.length;

const count = (arr, key) => { const m = {}; for (const x of arr) { const k = key(x) || "(공란)"; m[k] = (m[k] || 0) + 1; } return m; };
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

const out = {
  생성일: new Date().toISOString().slice(0, 10),
  전체: cen.length,
  국민신청: { 건수: nat.length, 비율: +((nat.length / cen.length) * 100).toFixed(1), 기관수: new Set(nat.map((d) => d.nstNm)).size },
  연도별: byYear,
  조문: { 시행일: "2018-11-27", 공포: "2018-11-27", 호수: "대통령령 제29305호",
         조문: "제63조의3제1항제6호", 문구: "제63조의5제1항에 따라 행정안전부장관이 정한 절차에 따라 국민이 신청한 사업" },
  조회보정: { 보정전_국민신청: med(nat.map((d) => num(d.inqCnt))),
             보정전_그외: med(cen.filter((d) => !isCitizen(d.slctnStdr)).map((d) => num(d.inqCnt))),
             보정후_배율: +adjusted.toFixed(2), 사용한_연도수: ratios.length },
  기관상위: top(count(nat, (d) => d.nstNm), 6),
  표기흔들림: top(count(nat, (d) => (d.slctnStdr || "").trim()), 5),
  상세대조: (() => {
    const g = { 국민신청: [], 그외: [] };
    for (const d of cen) { const k = det.get(`${d.gclfCd}|${d.year}`); if (!k) continue;
      (isCitizen(d.slctnStdr) ? g.국민신청 : g.그외).push(k); }
    const f = (a) => ({ n: a.length, 추진실적중앙: med(a.map((x) => num(x.prtnCnt))),
      원문연결: a.length ? Math.round((a.filter((x) => num(x.wonmunCnt) > 0).length / a.length) * 100) : null });
    return { 국민신청: f(g.국민신청), 그외: f(g.그외) };
  })(),
};
fs.mkdirSync(R("notes"), { recursive: true });
fs.writeFileSync(R("notes/citizen.json"), JSON.stringify(out, null, 2));
console.error(`국민신청 ${out.국민신청.건수}건(${out.국민신청.비율}%) · 기관 ${out.국민신청.기관수}곳`);
console.error(`조회 보정 전 ${out.조회보정.보정전_국민신청} vs ${out.조회보정.보정전_그외} → 같은 해 기준 ${out.조회보정.보정후_배율}배`);
console.error(`연도별 국민신청: ${byYear.map((r) => r.nat).join(" → ")}`);
console.error(`상세 대조: 국민신청 n=${out.상세대조.국민신청.n} · 그외 n=${out.상세대조.그외.n}`);
