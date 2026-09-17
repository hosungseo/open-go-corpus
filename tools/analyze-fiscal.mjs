// 노트 ⑦ — 행안부 국정과제 세부과제 54개 ↔ 열린재정 2026 세출 세부사업. 판정은 notes/fiscal-link-review.json(사람), 금액은 fiscal/ofd-행정안전부-2026-sub.json.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const J = (p) => JSON.parse(fs.readFileSync(R(p), "utf8"));
const OFD = J("fiscal/ofd-행정안전부-2026-sub.json"), REV = J("notes/fiscal-link-review.json").판정, RAW = J("notes/fiscal-match-raw.json");
const G = J("lawhist/gukjeong-123.json").과제, SUB = J("lawhist/gukjeong-123-sub.json").과제;
const lineOf = {}; for (const l of OFD.세부사업) lineOf[l.세부] = l;
const 목록 = [];
for (const t of G.filter((x) => x.org.includes("행안부"))) for (const s of (SUB.find((x) => x.n === t.n) || { 세부: [] }).세부) {
  const r = REV[s.no]; if (!r) { console.error("판정 없음", s.no); process.exit(1); }
  const lines = r.근거세부사업.map((nm) => { const l = lineOf[nm]; if (!l) { console.error("세부사업 못 찾음", s.no, nm); process.exit(1); } return { nm, 단위: l.단위, 프로그램: l.프로그램, 억: Math.round(l.예산천원 / 1e5) }; });
  const 사유 = r.판정 === "없음" ? r.이유.split(" — ")[0] : "";
  목록.push({ no: s.no, n: t.n, 과제: t.nm, t: s.제목.replace(/\s{2,}.*$/, "").slice(0, 40), j: r.판정, 사유, why: r.이유, lines, 억: lines.reduce((a, l) => a + l.억, 0), 후보수: (RAW.세부.find((x) => x.no === s.no) || {}).후보수 || 0 });
}
const cnt = (f) => 목록.filter(f).length;
const 확실 = 목록.filter((d) => d.j === "확실");
const 교부세 = new Set(["보통교부세", "부동산교부세", "소방안전교부세", "재난안전관리특별교부세"]);
const sum = (arr, skip) => Math.round(arr.reduce((a, d) => a + d.lines.filter((l) => !skip || !교부세.has(l.nm)).reduce((b, l) => b + l.억, 0), 0));
const 없음사유 = {}; for (const d of 목록.filter((d) => d.j === "없음")) 없음사유[d.사유] = (없음사유[d.사유] || 0) + 1;
const out = {
  작성일: new Date().toISOString().slice(0, 10), 기준: "열린재정 ExpenditureBudgetAdd2 · FSCL_YY 2026 · OFFC_NM 행정안전부 · 2026-09-18 수집 · 확정+수정 예산(천원) 편성목 합산",
  부처: "행정안전부", 과제수: new Set(목록.map((d) => d.n)).size, 세부과제수: 목록.length, 세부사업수: OFD.세부사업수, 편성목행: 3312,
  총예산억: Math.round(OFD.세부사업.reduce((a, l) => a + l.예산천원, 0) / 1e5), 교부세억: Math.round(OFD.세부사업.filter((l) => 교부세.has(l.세부)).reduce((a, l) => a + l.예산천원, 0) / 1e5),
  판정: { 확실: 확실.length, 애매: cnt((d) => d.j === "애매"), 없음: cnt((d) => d.j === "없음") }, 없음사유,
  자동후보있음: cnt((d) => d.후보수 > 0), 확실중자동후보없음: 확실.filter((d) => !d.후보수).length,
  확실예산억: sum(확실, false), 확실예산억_교부세제외: sum(확실, true),
  주민자치회: { no: "52-4", 국비세부사업: 0, 경로: "특별교부금(시책수요) · 지방재정365", 근거: "2.0 시안 문서 카드 d7 '주민자치회 운영 우수 자치단체 선정결과에 따른 특별교부금 지급요청'" },
  이름다른예: [{ no: "14-2", 세부과제: "선제적·통합적 공공서비스", 세부사업: "지능형 서비스 확대 및 운영(정보화)" }, { no: "73-4", 세부과제: "재난피해 지원확대", 세부사업: "재난대책비(보조)" }, { no: "14-3", 세부과제: "주민주도 문제해결(리빙랩)", 세부사업: "지역사회 자생적 창조역량 강화" }],
  타부처예: 목록.filter((d) => d.사유 === "타부처 예산").map((d) => ({ no: d.no, t: d.t.slice(0, 18), 부처: d.why.replace(/^타부처 예산 — /, "").replace(/\(.*$/, "").trim() })),
  목록,
};
fs.writeFileSync(R("notes/fiscal-link.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`행안부 세부과제 ${out.세부과제수} — 확실 ${out.판정.확실} · 애매 ${out.판정.애매} · 없음 ${out.판정.없음} (${Object.entries(없음사유).map(([k, v]) => k + " " + v).join(" · ")}) | 확실 줄 예산 ${out.확실예산억.toLocaleString()}억(교부세 제외 ${out.확실예산억_교부세제외.toLocaleString()}억) | 자동 후보 없던 확실 ${out.확실중자동후보없음}`);
