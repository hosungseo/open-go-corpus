// 공개 장소 분석 — 포털 등록의 결락을 찾는다.
// 규정 제63조의3제3항이 정한 공개 장소는 기관 누리집이고 포털은 조문에 없다.
// 포털 등록이 의무가 아니므로 결락이 생긴다. 그 결락을 세어 둔다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const SRC = R("realname/central.jsonl");
const OUT = R("notes/venue.json");
const CUR = 2026;                       // 등록이 진행 중인 해
const YRS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

if (!fs.existsSync(SRC)) { console.error("ERROR realname/central.jsonl 없음"); process.exit(1); }
const rows = fs.readFileSync(SRC, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const org = new Map();
for (const r of rows) {
  if (!org.has(r.nstNm)) org.set(r.nstNm, {});
  const o = org.get(r.nstNm);
  o[r.year] = (o[r.year] || 0) + 1;
}

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// 앞뒤로는 등록이 있는데 가운데만 0인 칸. 기관이 그 해에만 일을 쉬었다고 보기 어렵다.
const 결락 = [];
for (const [nm, y] of org) {
  const v = YRS.map((k) => y[k] || 0);
  const gaps = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== 0) continue;
    if (v.slice(0, i).some((x) => x > 0) && v.slice(i + 1).some((x) => x > 0)) gaps.push(YRS[i]);
  }
  if (!gaps.length) continue;
  const 평년 = med(v.filter((x) => x > 0));
  결락.push({ nm, gaps, 평년, 추정: gaps.length * 평년, 연도별: v });
}
결락.sort((a, b) => b.추정 - a.추정);

const 연도합 = {};
for (const y of [...YRS, CUR]) 연도합[y] = rows.filter((r) => r.year === y).length;

const 결락연도 = {};
for (const d of 결락) for (const g of d.gaps) 결락연도[g] = (결락연도[g] || 0) + 1;

const 올해등록 = [...org].filter(([, y]) => (y[CUR] || 0) > 0)
  .map(([nm, y]) => ({ nm, n: y[CUR] })).sort((a, b) => b.n - a.n);

const 기준 = rows.filter((r) => r.year <= 2025).length;
const 추정누락 = 결락.reduce((s, d) => s + d.추정, 0);

// 기관 누리집 실측을 붙여 연도를 맞춰 대조한다.
const HP = R("notes/venue-homepage.json");
let 대조 = null;
if (fs.existsSync(HP)) {
  const hp = JSON.parse(fs.readFileSync(HP, "utf8"));
  const at = (nm, y) => rows.filter((r) => r.nstNm === nm && r.year === y).length;
  대조 = {
    조사일: hp.조사일, 방법: hp.방법, 주의: hp.주의,
    기관: hp.기관.map((o) => {
      const 연도 = Object.keys(o.연도).map(Number).sort().map((y) => {
        const 포털 = at(o.nm, y), 누리집 = o.연도[y];
        return { 연도: y, 포털, 누리집,
                 판정: 포털 === 누리집 ? "일치" : 포털 === 0 && 누리집 > 0 ? "포털 결락" : "차이" };
      });
      return { ...o, 포털누적: rows.filter((r) => r.nstNm === o.nm).length, 연도대조: 연도 };
    }),
  };
  대조.요약 = {
    조사기관: 대조.기관.length,
    결락확인: 대조.기관.flatMap((o) => o.연도대조).filter((x) => x.판정 === "포털 결락").length,
    일치: 대조.기관.flatMap((o) => o.연도대조).filter((x) => x.판정 === "일치").length,
  };
}

const out = {
  작성일: new Date().toISOString().slice(0, 10),
  원천: "정보공개포털 정책실명제 중앙행정기관 전수 (realname/central.jsonl)",
  기관수: org.size,
  연도합,
  기준등록: 기준,
  결락: {
    기관수: 결락.length,
    칸수: 결락.reduce((s, d) => s + d.gaps.length, 0),
    추정누락: 추정누락,
    비율: +(추정누락 / 기준 * 100).toFixed(1),
    연도별기관수: 결락연도,
    목록: 결락,
  },
  올해: { 연도: CUR, 등록기관: 올해등록.length, 전체기관: org.size, 목록: 올해등록 },
  연도: YRS,
  대조,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`결락 기관 ${결락.length}/${org.size} · 칸 ${out.결락.칸수} · 추정 누락 ${추정누락}건 (+${out.결락.비율}%)`);
console.log(`${CUR}년 등록 완료 ${올해등록.length}/${org.size}개 기관`);
if (대조) console.log(`누리집 대조: ${대조.요약.조사기관}개 기관 · 포털 결락 확인 ${대조.요약.결락확인}칸 · 일치 ${대조.요약.일치}칸`);
console.log(`결락이 몰린 해: ` + Object.entries(결락연도).sort((a,b)=>b[1]-a[1]).map(([y,n])=>`${y}년 ${n}개 기관`).join(" · "));
