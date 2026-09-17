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
const recent = rows.filter((r) => r.year >= 2025).map((r) => ({ org: r.nstNm, nm: dec(r.plcNm), txt: dec(r.plcNm) + " " + dec(r.prjtSmry), smry: dec(r.prjtSmry), bg: dec(r.prtnCtt), gj: /국정과제/.test(r.slctnStdr || ""), year: r.year, id: r.gclfCd }));
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
    const hitIds = new Set(hits.map((r) => r.id + "|" + r.year));
    const bodyHits = recent.filter((r) => orgs.includes(r.org) && !hitIds.has(r.id + "|" + r.year) && ks.some((k) => k.length >= 3 && (r.smry.includes(k) || r.bg.includes(k))))
      .map((r) => ({ ...r, score: ks.filter((k) => r.smry.includes(k) || r.bg.includes(k)).length }))
      .sort((x, y) => (y.score - x.score) || (x.nm.length - y.nm.length));
    detail.push({ no: s.no, 제목: s.제목.slice(0, 40), 핵심어: ks, 사업수: hits.length, 국정과제표시사업수: gjHits.length, 예: hits.slice(0, 2).map((r) => r.org + "·" + r.nm.slice(0, 24)), 사업: hits.map((r) => ({ org: r.org, nm: r.nm, y: r.year, id: r.id })), 본문후보수: bodyHits.length, 본문후보: bodyHits.slice(0, 6).map((r) => ({ org: r.org, nm: r.nm, y: r.year, id: r.id, score: r.score })) });
    if (hits.length) { matched++; byTask[t.n] = (byTask[t.n] || 0) + 1; if (examples.length < 10 && ks.length) examples.push(`${s.no} ${ks.join("/")} ← ${hits.slice(0, 2).map((r) => r.nm.slice(0, 22)).join(" · ")}`); }
  }
}
const withKw = detail.filter((d) => d.핵심어.length).length;
const norm = (s) => (s || "").replace(/[\s·ㆍ・,.()「」'"‘’“”\-–]/g, "");
const cites = [];
for (const r of recent) {
  const body = norm(r.nm + " " + r.smry + " " + r.bg);
  const named = G.filter((x) => x.nm.length >= 6 && body.includes(norm(x.nm))).map((x) => x.n);
  const quoted = [...(r.smry + " " + r.bg).matchAll(/국정과제\s*[「'‘"“]([^」'’"”]{4,40})[」'’"”]/g)].map((m) => m[1]);
  const numbered = [...new Set([...(r.smry + " " + r.bg).matchAll(/국정과제\s*[(（]?\s*(\d{1,3})(?:\s*-\s*(\d{1,2}))?/g)].map((m) => m[2] ? m[1] + "-" + m[2] : m[1]))];
  if (named.length || quoted.length || numbered.length) cites.push({ org: r.org, nm: r.nm, y: r.year, id: r.id, 과제: named, 인용문: quoted, 번호: numbered });
}
// 사람 검수를 얹는다. 자동 대조는 실마리이고 판정은 검수다.
const REV_PATH = R("notes/gukjeong-sub-review.json");
const REVJ = fs.existsSync(REV_PATH) ? JSON.parse(fs.readFileSync(REV_PATH, "utf8")) : { 판정: {}, "2차": {} };
const REV = REVJ.판정 || {}, REV2 = Object.assign({}, REVJ["2차"] || {});
// 3차(교차 검수 반영)의 근거사업·이유도 같은 자리에서 읽는다. 뒤 단계가 앞 단계를 덮는다.
for (const [no, e] of Object.entries((REVJ.교차검수 && REVJ.교차검수["3차"]) || {})) REV2[no] = Object.assign({}, REV2[no] || {}, { 이유: e.이유, 근거사업: e.근거사업 || (REV2[no] && REV2[no].근거사업) || "" });
for (const d of detail) {
  d.검수 = d.사업수 ? (REV[d.no] || "미검수") : "";
  d.검수이유 = (REV2[d.no] && REV2[d.no].이유) || "";
  // 2차 판정에서 근거로 삼은 사업이 첫 예시가 아니면 앞으로 끌어온다. 예시가 판정과 어긋나 보이면 안 된다.
  const biz = REV2[d.no] && REV2[d.no].근거사업;
  if (biz) { const i = d.사업.findIndex((h) => h.nm.trim() === biz); if (i > 0) { const [h] = d.사업.splice(i, 1); d.사업.unshift(h); d.예 = d.사업.slice(0, 2).map((r) => r.org + "·" + r.nm.slice(0, 24)); } else if (i < 0) console.warn("근거사업 못 찾음", d.no, biz); }
}
const REVB = (REVJ.본문 && REVJ.본문.판정) || {};
for (const d of detail) {
  const b = REVB[d.no];
  d.본문검수 = (!d.사업수 && d.본문후보수) ? (b ? b.판정 : "미검수") : "";
  d.본문검수이유 = b ? b.이유 : "";
  if (b && b.근거사업) { const i = d.본문후보.findIndex((h) => h.nm.trim() === b.근거사업); if (i > 0) { const [h] = d.본문후보.splice(i, 1); d.본문후보.unshift(h); } else if (i < 0) console.warn("본문 근거사업 못 찾음", d.no, b.근거사업); }
}
const 본문검수집계 = { 확실: 0, 애매: 0, 오탐: 0, 미검수: 0 };
for (const d of detail) if (d.본문검수) 본문검수집계[d.본문검수] = (본문검수집계[d.본문검수] || 0) + 1;
const 검수집계 = { 확실: 0, 애매: 0, 오탐: 0, 미검수: 0 };
for (const d of detail) if (d.사업수) 검수집계[d.검수] = (검수집계[d.검수] || 0) + 1;
const out = { 작성일: new Date().toISOString().slice(0, 10), 기준: "2025~2026년 정책실명제 등록 · 같은 주관부처 · 세부과제 앞머리 핵심어 포함", 세부과제수: detail.length, 핵심어있는세부과제: withKw, 관련사업있는세부과제: matched, 과제수: Object.keys(byTask).length, 검수집계, 본문검수집계, 본문후보있는세부과제: detail.filter((d) => d.본문후보수).length, 이름없이본문만: detail.filter((d) => !d.사업수 && d.본문후보수).length, 국정과제명인용카드: cites, 세부: detail };
fs.writeFileSync(R("notes/gukjeong-sub-match.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`세부과제 ${detail.length}개 중 핵심어 있는 것 ${withKw} · 같은 주관부처의 2025~26 사업에 핵심어가 나오는 세부과제 ${matched}개(${(matched / detail.length * 100).toFixed(0)}%) · 걸린 과제 ${Object.keys(byTask).length}개/123`);
console.log("검수:", JSON.stringify(검수집계));
console.log("본문 검수:", JSON.stringify(본문검수집계), "· 번호 인용 카드", cites.filter((c) => c.번호.length).length);
console.log(`본문 후보: 세부과제 ${detail.filter((d) => d.본문후보수).length}개 (이름 대조 없이 본문만 ${detail.filter((d) => !d.사업수 && d.본문후보수).length}개) · 국정과제명 직접 인용 카드 ${cites.length}장`);
