// 세부과제(주요내용 불릿) ↔ 정책실명제 사업 — 같은 주관부처 안에서 핵심어가 겹치면 "관련 사업 있음"으로 본다. 느슨한 어림이다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const SUB = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123-sub.json"), "utf8"));
const G = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123.json"), "utf8")).과제;
const rows = fs.readFileSync(R("realname/central.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const ALIAS = {행안부:"행정안전부",복지부:"보건복지부",국토부:"국토교통부",과기정통부:"과학기술정보통신부",기후부:"기후에너지환경부",금융위:"금융위원회",노동부:"고용노동부",국조실:"국무조정실",국방부:"국방부",산업부:"산업통상부",문체부:"문화체육관광부",외교부:"외교부",농식품부:"농림축산식품부",법무부:"법무부",교육부:"교육부",해수부:"해양수산부",성평등부:"성평등가족부",통일부:"통일부",경찰청:"경찰청",방미통위:"방송미디어통신위원회",보훈부:"국가보훈부",기획처:"기획예산처",재경부:"재정경제부",중기부:"중소벤처기업부",공정위:"공정거래위원회",감사원:"감사원",인권위:"국가인권위원회",인사처:"인사혁신처",권익위:"국민권익위원회",개인정보위:"개인정보보호위원회",행복청:"행정중심복합도시건설청",방사청:"방위사업청",동포청:"재외동포청"};
const full = (ab) => ALIAS[ab.replace(/ 등$/, "")] || ab.replace(/ 등$/, "");
const dec = (s) => (s || "").replace(/&#40;/g, "(").replace(/&#41;/g, ")").replace(/&#\d+;/g, " ");
// 부처명은 접미사(…부)로 거르면 '위안부' 같은 말까지 잘려 나간다. 이름 목록으로만 거른다.
const ORGWORDS = new Set([...Object.keys(ALIAS), ...Object.values(ALIAS), "국무조정실", "국무총리실"]);
const STOP = new Set(["강화","확대","구축","추진","지원","도입","마련","개선","확립","조성","제고","활성화","혁신","운영","체계","기반","전환","정립","완성","수립","단계적","확충","제정","시행","확보","육성","개편","고도화","관리","정책","사업","제도","방안","계획","국민","지역","안전","기술","산업","서비스","협력","공공","민간","통합","시스템","플랫폼","대응","예방","보호","보장","실현","실시","촉진"]);
// 세부과제 제목의 앞머리(굵은 표제)에서 핵심어를 뽑는다: 첫 12자 안의 2자 이상 낱말
const kw = (title) => { const lead = title.split(/\s{2,}|\s[\-–]\s/)[0].slice(0, 26);
  // 한글·영숫자·하이픈만 남긴다. PDF의 따옴표·가운뎃점은 문자 코드가 제각각이라 하나씩 나열하면 빠진다.
  return [...new Set(lead.replace(/[^가-힣A-Za-z0-9\s-]/g, " ").split(/\s+/).map((w) => w.replace(/(들|을|를|이|가|의|로|으로|에|와|과|및)$/, "")).filter((w) => w.length >= 3 && !STOP.has(w) && !ORGWORDS.has(w) && !/^(국정|과제|정부|국가|사회적|단계별|맞춤형)$/.test(w)))]; };
const recent = rows.filter((r) => r.year >= 2025).map((r) => ({ org: r.nstNm, nm: dec(r.plcNm), txt: dec(r.plcNm) + " " + dec(r.prjtSmry), gj: /국정과제/.test(r.slctnStdr || ""), year: r.year }));
let matched = 0, byTask = {}, examples = [];
const detail = [];
for (const t of SUB.과제) {
  const task = G.find((x) => x.n === t.n); const orgs = task ? task.org.split("·").map(full) : [];
  for (const s of t.세부) {
    const ks = kw(s.제목);
    const hits = recent.filter((r) => orgs.includes(r.org) && ks.some((k) => r.nm.includes(k)))   // 사업명에만 맞춘다. 개요는 부처명·상투어가 많아 헛짚는다.
      .map((r) => ({ ...r, score: ks.filter((k) => r.nm.includes(k)).length + ks.filter((k) => k.length >= 5 && r.nm.includes(k)).length }))
      .sort((x, y) => (y.score - x.score) || (x.nm.length - y.nm.length));   // 예시는 핵심어가 많이·길게 겹치는 사업부터, 같으면 짧은 사업명(더 특정한 쪽)
    const gjHits = hits.filter((r) => r.gj);
    detail.push({ no: s.no, 제목: s.제목.slice(0, 40), 핵심어: ks, 사업수: hits.length, 국정과제표시사업수: gjHits.length, 예: hits.slice(0, 2).map((r) => r.org + "·" + r.nm.slice(0, 24)) });
    if (hits.length) { matched++; byTask[t.n] = (byTask[t.n] || 0) + 1; if (examples.length < 10 && ks.length) examples.push(`${s.no} ${ks.join("/")} ← ${hits.slice(0, 2).map((r) => r.nm.slice(0, 22)).join(" · ")}`); }
  }
}
const withKw = detail.filter((d) => d.핵심어.length).length;
const out = { 작성일: new Date().toISOString().slice(0, 10), 기준: "2025~2026년 정책실명제 등록 · 같은 주관부처 · 세부과제 앞머리 핵심어 포함", 세부과제수: detail.length, 핵심어있는세부과제: withKw, 관련사업있는세부과제: matched, 과제수: Object.keys(byTask).length, 세부: detail };
fs.writeFileSync(R("notes/gukjeong-sub-match.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`세부과제 ${detail.length}개 중 핵심어 있는 것 ${withKw} · 같은 주관부처의 2025~26 사업에 핵심어가 나오는 세부과제 ${matched}개(${(matched / detail.length * 100).toFixed(0)}%) · 걸린 과제 ${Object.keys(byTask).length}개/123`);
console.log("예:"); examples.forEach((e) => console.log("  " + e));
