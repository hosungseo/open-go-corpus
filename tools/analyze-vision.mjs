// 비전 — 국정과제 전부에 정책실명제를, 지금보다 훨씬 깊게.
// 그 근거가 되는 수치를 한 번에 뽑는다: 국정과제 표시 사업이 얼마나 얇고, 얼마나 끊기고, 얼마나 이어지지 않는가.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const rows = fs.readFileSync(R("realname/central.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const det = fs.readFileSync(R("realname/detail.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const GJ = JSON.parse(fs.readFileSync(R("notes/gukjeong.json"), "utf8"));
const isGJ = (r) => /국정과제/.test(r.slctnStdr || "");
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const len = (s) => (s || "").replace(/\s/g, "").length;
const pct = (a, b) => +(a / b * 100).toFixed(1);

function depth(set) {
  return {
    건수: set.length,
    사업개요자: med(set.map((r) => len(r.prjtSmry))),
    추진실적자: med(set.map((r) => len(r.prtnCtt))),
    금액언급: pct(set.filter((r) => /억|백만|천만|원\b|예산\s*[\d,]+/.test((r.prjtSmry || "") + (r.prtnCtt || ""))).length, set.length),
    근거법령: pct(set.filter((r) => /근거법령|「.+?법」|법\s*제\d+조/.test(r.prjtSmry || "")).length, set.length),
    조회수: med(set.map((r) => +r.inqCnt || 0)),
  };
}
const gj = rows.filter(isGJ), other = rows.filter((r) => !isGJ(r));

// 계보: 기관+사업명이 몇 해 이어지나
const key = (r) => r.nstNm + "|" + (r.plcNm || "").replace(/\s|[（(].*?[)）]/g, "");
const yrs = {}; gj.forEach((r) => { (yrs[key(r)] = yrs[key(r)] || new Set()).add(r.year); });
const spans = Object.values(yrs).map((s) => s.size);
const dist = {}; spans.forEach((n) => { dist[n] = (dist[n] || 0) + 1; });

// 문서 연결 (상세 784건)
const gjKey = new Set(gj.map((r) => r.nstNm + "|" + r.year + "|" + r.plcNm));
const dGJ = det.filter((d) => gjKey.has(d.nstNm + "|" + d.year + "|" + d.plcNm)), dOther = det.filter((d) => !gjKey.has(d.nstNm + "|" + d.year + "|" + d.plcNm));
const link = (set) => ({ 건수: set.length, 추진실적건: med(set.map((d) => +d.prtnCnt || 0)), 원문연결건: med(set.map((d) => +d.wonmunCnt || 0)), 원문0건비율: pct(set.filter((d) => !(+d.wonmunCnt)).length, set.length) });

// 국정과제 포털 실측(aside)을 합친다
const PORTAL = JSON.parse(fs.readFileSync(R("notes/vision-portal.json"), "utf8"));
const P = PORTAL.과제;
const 포털 = {
  과제수: P.length,
  실적자중앙: med(P.map((t) => t.실적자)), 실적건중앙: med(P.map((t) => t.실적건)),
  목표자중앙: med(P.map((t) => t.목표2026자)), 과제내용자중앙: med(P.map((t) => t.과제내용자)),
  본문합중앙: med(P.map((t) => t.목표2026자 + t.성과자 + t.실적자 + t.향후자 + t.과제내용자)),
  없는것: PORTAL.없는것,
};

const out = {
  작성일: new Date().toISOString().slice(0, 10),
  원천: "정보공개포털 정책실명제 전수 6,847건 · 상세 784건 · notes/gukjeong.json",
  깊이: { 국정과제표시: depth(gj), 그외: depth(other) },
  계보: { 사업수: spans.length, 한해만: dist[1] || 0, 한해만비율: pct(dist[1] || 0, spans.length), 세해이상: spans.filter((n) => n >= 3).length, 분포: dist },
  문서연결: { 국정과제표시: link(dGJ), 그외: link(dOther) },
  예산칸: { 전수: false, 상세: false },
  포털,
  국정과제: { 전체: 123, 주관부처경로등록: GJ.상태별["2026 등록"] || 0, 포털에없음: GJ.상태별["포털에 없음"] || 0, 번호기재: GJ.번호기재.건수, 번호기재현정부: GJ.번호기재.체계["123대 (2025~)"] || 0 },
};
fs.writeFileSync(R("notes/vision.json"), JSON.stringify(out, null, 2) + "\n");
const d = out.깊이;
console.log(`깊이 — 국정과제 표시 ${d.국정과제표시.건수}건: 개요 ${d.국정과제표시.사업개요자}자 · 금액 ${d.국정과제표시.금액언급}% · 근거 ${d.국정과제표시.근거법령}%   |   그 외 ${d.그외.건수}건: 개요 ${d.그외.사업개요자}자 · 금액 ${d.그외.금액언급}% · 근거 ${d.그외.근거법령}%`);
console.log(`계보 — 국정과제 사업 ${out.계보.사업수}개 중 한 해만 ${out.계보.한해만}개(${out.계보.한해만비율}%) · 세 해 이상 ${out.계보.세해이상}개`);
console.log(`문서 — 국정과제 표시 ${out.문서연결.국정과제표시.건수}건 중 원문 0건 ${out.문서연결.국정과제표시.원문0건비율}%`);
console.log(`포털 — 8개 과제 본문 합 중앙 ${out.포털.본문합중앙}자 · 추진실적 중앙 ${out.포털.실적자중앙}자/${out.포털.실적건중앙}건 · 담당자·예산·문서·세부과제 0/8`);
console.log(`국정과제 — 123개 중 등록 ${out.국정과제.주관부처경로등록} · 포털에 없음 ${out.국정과제.포털에없음} · 현 정부 번호 기재 ${out.국정과제.번호기재현정부}건`);
