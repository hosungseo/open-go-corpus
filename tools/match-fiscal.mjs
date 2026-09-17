// 행안부 국정과제 세부과제 ↔ 열린재정 세출 세부사업 대조. 세부과제 앞머리 핵심어가 세부사업·단위사업·프로그램 이름에 나오면 후보.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const [ofdPath = "fiscal/ofd-행정안전부-2026.json", orgAb = "행안부"] = process.argv.slice(2);
const OFD = JSON.parse(fs.readFileSync(ofdPath, "utf8"));
const G = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123.json"), "utf8")).과제;
const SUB = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123-sub.json"), "utf8")).과제;
const amt = (r) => { for (const k of ["Y_YY_DFN_MEDI_KCUR_AMT", "Y_YY_DFN_KCUR_AMT", "Y_YY_MEDI_KCUR_AMT"]) { const v = +r[k]; if (v) return v; } return 0; };
// 세부사업 단위로 합친다 (편성목 행을 합산)
const by = new Map();
for (const r of OFD) { const k = [r.PGM_NM, r.ACTV_NM, r.SACTV_NM].join("›"); const o = by.get(k) || { 프로그램: r.PGM_NM, 단위: r.ACTV_NM, 세부: r.SACTV_NM, 회계: r.FSCL_NM, 분야: r.FLD_NM, 부문: r.SECT_NM, 예산천원: 0 }; o.예산천원 += amt(r); by.set(k, o); }
const lines = [...by.values()];
const STOP = new Set(["강화","확대","구축","추진","지원","도입","마련","개선","확립","조성","제고","활성화","혁신","운영","체계","기반","전환","정립","완성","수립","단계적","확충","제정","시행","확보","육성","개편","고도화","관리","정책","사업","제도","방안","계획","국민","지역","안전","기술","산업","서비스","협력","국가","정부","통합","대응"]);
const kw = (title) => { const lead = title.split(/\s{2,}|\s[\-–]\s/)[0].slice(0, 26); return [...new Set(lead.replace(/[^가-힣A-Za-z0-9\s-]/g, " ").split(/\s+/).map((w) => w.replace(/(들|을|를|이|가|의|로|으로|에|와|과|및)$/, "")).filter((w) => w.length >= 2 && !STOP.has(w)))]; };
const norm = (s) => (s || "").replace(/\s+/g, "");
const out = [];
for (const t of G.filter((x) => x.org.includes(orgAb))) {
  for (const s of (SUB.find((x) => x.n === t.n) || { 세부: [] }).세부) {
    const ks = kw(s.제목);
    const hits = lines.map((l) => { const txt = norm(l.프로그램 + " " + l.단위 + " " + l.세부); const m = ks.filter((k) => k.length >= 2 && txt.includes(norm(k))); return { l, m }; }).filter((x) => x.m.length && (x.m.some((k) => k.length >= 3) || x.m.length >= 2))
      .sort((a, b) => (b.m.length - a.m.length) || (b.l.예산천원 - a.l.예산천원));
    out.push({ no: s.no, 과제: t.nm, 제목: s.제목.slice(0, 60), 핵심어: ks, 후보수: hits.length, 후보: hits.slice(0, 5).map((h) => ({ 세부: h.l.세부, 단위: h.l.단위, 프로그램: h.l.프로그램, 예산억: Math.round(h.l.예산천원 / 1e5), 겹침: h.m })) });
  }
}
const withHit = out.filter((o) => o.후보수);
console.log(`${orgAb} 세부과제 ${out.length}개 · 세부사업 ${lines.length}개(예산 ${Math.round(lines.reduce((a, l) => a + l.예산천원, 0) / 1e5).toLocaleString()}억) · 후보 있는 세부과제 ${withHit.length}개`);
for (const o of out) { console.log(`\n[${o.no}] ${o.제목}\n   핵심어 ${JSON.stringify(o.핵심어)} · 후보 ${o.후보수}`); for (const h of o.후보) console.log(`   ← ${h.세부}  (${h.단위} / ${h.프로그램}) ${h.예산억.toLocaleString()}억  겹침 ${h.겹침.join("·")}`); }
fs.writeFileSync(R("notes/fiscal-match-raw.json"), JSON.stringify({ 작성일: new Date().toISOString().slice(0, 10), 기준: "열린재정 ExpenditureBudgetAdd2 2026 행정안전부 · 세부과제 앞머리 핵심어 ⊂ 프로그램·단위·세부사업명", 세부과제수: out.length, 세부사업수: lines.length, 후보있는세부과제: withHit.length, 세부: out }, null, 1) + "\n");
