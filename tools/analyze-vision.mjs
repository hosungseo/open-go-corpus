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

const out = {
  작성일: new Date().toISOString().slice(0, 10), 기준: `${CUR}-09-17 · 이재명정부 123대 국정과제`,
  원천: "정부업무평가포털 과제 8개 실측(notes/vision-portal.json) · 정보공개포털 정책실명제 2026년 등록 " + cur.length + "건 · notes/gukjeong.json",
  포털: { 표본: PORTAL.과제.length, 구조: PORTAL.구조, 없는것: PORTAL.없는것,
          있는것: "2026년 목표(3~5개) · 주요성과 · 추진실적(10~36건, 반기 갱신) · 향후계획 · 목표·기대효과 · 과제 내용(불릿 4~6개)" },
  실명제: { 있는것: "담당자 1명 + 결재선(기재율 100%) · 사업개요 한 문단 · 추진실적(연 1회) · 선정기준 '국정과제' 분류값",
            없는것: "국정과제 번호 칸 · 예산 칸 · 근거문서 링크(상세 283건 중 61%가 0건) · 세부과제" },
  현정부: { 등록건수: cur.length, 번호기재건수: cites.length, 가리킨과제수: named.length, 가리킨과제: named, 기재목록: cites,
            세부번호를스스로붙임: cites.filter((c) => c.세부번호).length },
  국정과제: { 전체: 123, 주관부처경로등록: GJ.상태별["2026 등록"] || 0, 포털에없음: GJ.상태별["포털에 없음"] || 0, 올해등록기관: GJ.올해등록기관, 포털기관수: GJ.포털기관수 },
};
fs.writeFileSync(R("notes/vision.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`현 정부 — 2026 등록 ${cur.length}건 중 번호 기재 ${cites.length}건 → 가리킨 국정과제 ${named.length}개/123: ${named.join(", ")} (세부번호 스스로 붙임 ${out.현정부.세부번호를스스로붙임}건)`);
console.log(`포털 — 표본 ${out.포털.표본}개: 담당자·예산·근거문서·세부과제·타 시스템 링크 0/8`);
console.log(`국정과제 — 주관부처 경로 등록 ${out.국정과제.주관부처경로등록} · 포털에 없음 ${out.국정과제.포털에없음}`);
