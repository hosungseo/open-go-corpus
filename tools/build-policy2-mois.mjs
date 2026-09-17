// 2.0 시안 데이터 — 행정안전부 주관 국정과제 전부. 과제마다 세부과제 → 연결된 정책실명제 사업 → 연도별 카드(시계열) → 예산 줄(열린재정) → 집행률(있으면).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const J = (p) => JSON.parse(fs.readFileSync(R(p), "utf8"));
const L = (p) => fs.readFileSync(R(p), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const G = J("lawhist/gukjeong-123.json").과제, SUB = J("lawhist/gukjeong-123-sub.json").과제, M = J("notes/gukjeong-sub-match.json"), FL = J("notes/fiscal-link.json");
const EXEJ = fs.existsSync(R("fiscal/ofd-행정안전부-2026-exec.json")) ? J("fiscal/ofd-행정안전부-2026-exec.json") : null;   // 집행률 — 단위사업 층에서만 공개된다
const EXE = EXEJ ? EXEJ.단위사업 : null;
const rows = L("realname/central.jsonl"), detail = L("realname/detail.jsonl"), probe = L("realname/probe-batch.jsonl");
const dec = (s) => (s || "").replace(/&#40;/g, "(").replace(/&#41;/g, ")").replace(/&#\d+;/g, " ").replace(/？/g, "·").trim();
const norm = (s) => dec(s).replace(/[\s·ㆍ,.()「」'"‘’“”\-–]/g, "");
const byName = {}; for (const r of rows) (byName[r.nstNm + "|" + norm(r.plcNm)] = byName[r.nstNm + "|" + norm(r.plcNm)] || []).push(r);
const det = {}; for (const d of detail) det[d.gclfCd + "|" + d.year] = d;
const prb = {}; for (const p of probe) prb[p.gclfCd + "|" + p.year] = p;
const tot = (x) => (x && typeof x === "object") ? (x.total ?? null) : null;
// 담당자 칸은 실명이 든 자유 문자열이다. 이름은 버리고 직위만 센다("과장 1 · 사무관 1 · 주무관 1"). 직위가 없으면 사람 수만.
const TITLES = ["담당관","과장","팀장","국장","실장","서기관","사무관","주무관","계장","전문위원","연구관","연구사","경정","경감","경위","경사","소방령","소방경","소방위","교수","박사","주임","주사","서기"];
const mask = (s) => { const raw = dec(s); const cnt = {}; for (const w of TITLES) { const n = (raw.match(new RegExp(w, "g")) || []).length; if (n) cnt[w] = n; }
  const parts = Object.entries(cnt).map(([k, v]) => k + " " + v); if (parts.length) return parts.join(" · ");
  const people = raw.split(/[,、·/]/).map((x) => x.trim()).filter(Boolean).length; return people ? "담당자 " + people : ""; };
const 과제 = [];
for (const t of G.filter((x) => x.org.includes("행안부"))) {
  const subs = (SUB.find((x) => x.n === t.n) || { 세부: [] }).세부;
  const 세부 = subs.map((s) => {
    const d = M.세부.find((x) => x.no === s.no) || {};
    let link = null;
    if (d.검수 === "확실" || d.검수 === "애매") link = { j: d.검수, via: "이름", ...d.사업[0] };
    else if (d.본문검수 === "확실" || d.본문검수 === "애매") link = { j: d.본문검수, via: "본문", ...d.본문후보[0] };
    let 연도 = [];
    if (link) {
      const cards = byName[link.org + "|" + norm(link.nm)] || [];
      연도 = cards.sort((a, b) => a.year - b.year).map((r) => { const dd = det[r.gclfCd + "|" + r.year], pp = prb[r.gclfCd + "|" + r.year]; return {
        y: +r.year, id: r.gclfCd, 부서: dec(r.chgrDeptNm).replace(/^행정안전부\s*/, ""), 담당: mask(r.chgrNm), 기간: dec(r.prjtPerd), 선정: dec(r.slctnStdr), 조회: +r.inqCnt || 0,
        추진실적: dd ? +dd.prtnCnt : null, 원문연결: dd ? +dd.wonmunCnt : null, 원문검색: pp ? tot(pp.orginl) : null, 사전정보: pp ? tot(pp.prev) : null, 검색어: pp ? pp.kwd : null }; });
    }
    const fl = FL.목록.find((x) => x.no === s.no) || {};
    return { no: s.no, t: s.제목.replace(/\s{2,}.*$/, "").slice(0, 44), 전문: s.제목.slice(0, 120), 사업: link ? { nm: dec(link.nm), org: link.org, j: link.j, via: link.via } : null, 연도, 예산: { j: fl.j || "없음", 사유: fl.사유 || "", lines: (fl.lines || []).map((l) => ({ nm: l.nm, 단위: l.단위, 억: l.억, 집행률: EXE && EXE[l.단위] ? EXE[l.단위].집행률 : null, 집행단위: EXE && EXE[l.단위] ? { 예산현액억: EXE[l.단위].예산현액억, 누계집행억: EXE[l.단위].누계집행억 } : null })), why: fl.why || "" } };
  });
  const yrs = new Set(); 세부.forEach((s) => s.연도.forEach((c) => yrs.add(c.y)));
  과제.push({ n: t.n, nm: t.nm, goal: t.goal, org: t.org, 세부수: 세부.length, 연결수: 세부.filter((s) => s.사업).length, 시계열년수: yrs.size, 연도범위: yrs.size ? [Math.min(...yrs), Math.max(...yrs)] : null,
    예산확실: 세부.filter((s) => s.예산.j === "확실").length, 예산억: 세부.filter((s) => s.예산.j === "확실").reduce((a, s) => a + s.예산.lines.reduce((b, l) => b + l.억, 0), 0), 세부 });
}
const out = { 작성일: new Date().toISOString().slice(0, 10), 기준: "정책실명제 중앙 2018~2026 전수(realname/central.jsonl) · 세부과제 대조(notes/gukjeong-sub-match.json 검수 확실·애매) · 예산 notes/fiscal-link.json · 집행률 " + (EXEJ ? "fiscal/ofd-행정안전부-2026-exec.json (VWFOEM, " + EXEJ.집행월 + "월 누계, 단위사업 층)" : "없음"), 집행월: EXEJ ? EXEJ.집행월 : null, 부처: "행정안전부", 과제수: 과제.length, 과제 };
fs.writeFileSync(R("notes/policy2-mois.json"), JSON.stringify(out, null, 1) + "\n");
console.log(과제.map((t) => `${t.n} 세부 ${t.세부수} 연결 ${t.연결수} 연도 ${t.연도범위 ? t.연도범위.join("~") : "-"} 예산확실 ${t.예산확실}(${t.예산억.toLocaleString()}억)`).join("\n"));
