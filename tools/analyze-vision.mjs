// 비전 — 국정과제 전부에 정책실명제를, 지금보다 훨씬 깊게.
// 현 정부 123대 국정과제만 본다. 글자 수는 세지 않는다. 항목이 있나 없나, 이름이 붙었나만 본다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const rows = fs.readFileSync(R("realname/central.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const G = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123.json"), "utf8")).과제;
const GJ = JSON.parse(fs.readFileSync(R("notes/gukjeong.json"), "utf8"));
const PORTAL = JSON.parse(fs.readFileSync(R("notes/vision-portal.json"), "utf8"));
const CUR = 2026;

// 현 정부 등록 기록 가운데 국정과제 번호를 어딘가 적은 것 — 그 번호가 가리키는 과제
const cur = rows.filter((r) => r.year === CUR);
const cites = [];
for (const r of cur) {
  const txt = (r.slctnStdr || "") + " " + (r.prjtSmry || "") + " " + (r.prtnCtt || "");
  for (const m of txt.matchAll(/국정과제\s*(\d{1,3})(-\d+)?/g)) {
    const n = +m[1]; if (n < 1 || n > 123) continue;
    const t = G.find((x) => x.n === n);
    cites.push({ n, 과제명: t ? t.nm : null, 주관: t ? t.org : null, 등록기관: r.nstNm, 사업: r.plcNm, 세부번호: !!m[2] });
  }
}
const named = [...new Set(cites.map((c) => c.n))].sort((a, b) => a - b);

// 주관부처가 2025~2026년에 국정과제 표시 사업을 등록한 과제 — 사업은 있으나 어느 과제인지는 특정 못 한다
const ALIAS = {행안부:"행정안전부",복지부:"보건복지부",국토부:"국토교통부",과기정통부:"과학기술정보통신부",기후부:"기후에너지환경부",금융위:"금융위원회",노동부:"고용노동부",국조실:"국무조정실",국방부:"국방부",산업부:"산업통상부",문체부:"문화체육관광부",외교부:"외교부",농식품부:"농림축산식품부",법무부:"법무부",교육부:"교육부",해수부:"해양수산부",성평등부:"성평등가족부",통일부:"통일부",경찰청:"경찰청",방미통위:"방송미디어통신위원회",보훈부:"국가보훈부",기획처:"기획예산처",재경부:"재정경제부",중기부:"중소벤처기업부",공정위:"공정거래위원회",감사원:"감사원",인권위:"국가인권위원회",인사처:"인사혁신처",권익위:"국민권익위원회",개인정보위:"개인정보보호위원회",행복청:"행정중심복합도시건설청",방사청:"방위사업청",동포청:"재외동포청"};
const full = (ab) => ALIAS[ab.replace(/ 등$/, "")] || ab.replace(/ 등$/, "");
const recent = rows.filter((r) => r.year >= 2025 && /국정과제/.test(r.slctnStdr || ""));
const orgHas = {}; recent.forEach((r) => { orgHas[r.nstNm] = (orgHas[r.nstNm] || 0) + 1; });
const viaOrg = G.filter((t) => t.org.split("·").some((o) => orgHas[full(o)])).map((t) => t.n);

// 세부과제(주요내용 불릿) ↔ 정책실명제 사업 대조 결과
const SUBM = JSON.parse(fs.readFileSync(R("notes/gukjeong-sub-match.json"), "utf8"));
const SUBL = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123-sub.json"), "utf8"));
const goalOf = (n) => { const t = G.find((x) => x.n === n); return t ? t.goal : null; };
const byGoal = {};
for (const d of SUBM.세부) { const n = +d.no.split("-")[0], g = goalOf(n); if (!g) continue; (byGoal[g] = byGoal[g] || { 세부: 0, 관련: 0 }).세부++; if (d.사업수) byGoal[g].관련++; }
const 세부 = { 총수: SUBM.세부과제수, 관련사업있음: SUBM.관련사업있는세부과제, 과제수: SUBM.과제수, 기준: SUBM.기준, 목표별: byGoal,
  손기입: cites.map((c) => ({ no: c.n + (c.세부번호 ? "" : ""), 등록기관: c.등록기관, 사업: c.사업 })),
  확실한예: SUBM.세부.filter((d) => d.사업수 && d.예.length).filter((d) => ["54-1","94-1","112-1","82-3","48-2","71-4","82-1","14-5","68-4","98-4"].includes(d.no)).map((d) => ({ no: d.no, 제목: d.제목.slice(0, 26), 사업: d.예[0] })) };

const out = {
  작성일: new Date().toISOString().slice(0, 10), 기준: `${CUR}-09-17 · 이재명정부 123대 국정과제`,
  원천: "정부업무평가포털 과제 8개 실측(notes/vision-portal.json) · 정보공개포털 정책실명제 2026년 등록 " + cur.length + "건 · notes/gukjeong.json",
  포털: { 표본: PORTAL.과제.length, 구조: PORTAL.구조, 없는것: PORTAL.없는것,
          있는것: "2026년 목표(3~5개) · 주요성과 · 추진실적(10~36건, 반기 갱신) · 향후계획 · 목표·기대효과 · 과제 내용(불릿 4~6개)" },
  실명제: { 있는것: "담당자 1명 + 결재선(기재율 100%) · 사업개요 한 문단 · 추진실적(연 1회) · 선정기준 '국정과제' 분류값",
            없는것: "국정과제 번호 칸 · 예산 칸 · 근거문서 링크(상세 283건 중 61%가 0건) · 세부과제" },
  현정부: { 등록건수: cur.length, 번호기재건수: cites.length, 가리킨과제수: named.length, 가리킨과제: named, 기재목록: cites,
            세부번호를스스로붙임: cites.filter((c) => c.세부번호).length,
            주관부처경로: { 기준: "2025~2026년 등록 · 선정기준 국정과제", 사업건수: recent.length, 기관수: Object.keys(orgHas).length, 과제수: viaOrg.length, 과제: viaOrg } },
  세부,
  국정과제: { 전체: 123, 주관부처경로등록: GJ.상태별["2026 등록"] || 0, 포털에없음: GJ.상태별["포털에 없음"] || 0, 올해등록기관: GJ.올해등록기관, 포털기관수: GJ.포털기관수 },
};
fs.writeFileSync(R("notes/vision.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`현 정부 — 2026 등록 ${cur.length}건 중 번호 기재 ${cites.length}건 → 가리킨 국정과제 ${named.length}개/123: ${named.join(", ")} (세부번호 스스로 붙임 ${out.현정부.세부번호를스스로붙임}건)`);
console.log(`주관부처 경로(2025~26) — 사업 ${recent.length}건 · 기관 ${Object.keys(orgHas).length}곳 · 걸린 과제 ${viaOrg.length}개/123`);
console.log(`세부과제 — ${세부.총수}개 중 관련 사업 있음 ${세부.관련사업있음}개(${(세부.관련사업있음/세부.총수*100).toFixed(0)}%) · 과제 ${세부.과제수}개`);
console.log(`포털 — 표본 ${out.포털.표본}개: 담당자·예산·근거문서·세부과제·타 시스템 링크 0/8`);
console.log(`국정과제 — 주관부처 경로 등록 ${out.국정과제.주관부처경로등록} · 포털에 없음 ${out.국정과제.포털에없음}`);
