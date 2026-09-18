// 보고 화면 2.0용 계보 — 한 사업(이름 핵심어)의 정책실명제 카드를 해마다 모아 시간 순으로 세운다. 실명은 싣지 않는다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const L = (p) => fs.readFileSync(R(p), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const [org = "행정안전부", kw = "지방소멸대응기금", no = "54-1"] = process.argv.slice(2);
const rows = L("realname/central.jsonl"), detail = L("realname/detail.jsonl"), probe = L("realname/probe-batch.jsonl");
const FL = JSON.parse(fs.readFileSync(R("notes/fiscal-link.json"), "utf8")), P2 = JSON.parse(fs.readFileSync(R("notes/policy2-mois.json"), "utf8"));
const dec = (s) => (s || "").replace(/&#40;/g, "(").replace(/&#41;/g, ")").replace(/&#\d+;/g, " ").replace(/？/g, "·").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
const TITLES = ["담당관","과장","팀장","국장","실장","서기관","사무관","주무관","계장","전문위원","연구관","연구사","장관","차관","실무관"];
// 실명 가림: 직위 앞의 2~4자 한글 이름 → ○○○. 직위 없이 이름만 있는 경우는 걸러낼 수 없으니 자유 문장은 길이도 짧게 자른다.
const mask = (s) => dec(s).replace(new RegExp("[가-힣]{2,4}\\s?(?=(" + TITLES.join("|") + "))", "g"), "○○○ ");
const roles = (s) => { const raw = dec(s); const cnt = {}; for (const w of TITLES) { const n = (raw.match(new RegExp(w, "g")) || []).length; if (n) cnt[w] = n; } const parts = Object.entries(cnt).map(([k, v]) => k + " " + v); return parts.length ? parts.join(" · ") : ""; };
const det = {}; for (const d of detail) det[d.gclfCd + "|" + d.year] = d;
const prb = {}; for (const p of probe) prb[p.gclfCd + "|" + p.year] = p;
const tot = (x) => (x && typeof x === "object") ? (x.total ?? null) : null;
const cards = rows.filter((r) => r.nstNm === org && dec(r.plcNm).includes(kw)).sort((a, b) => a.year - b.year);
const 연도 = cards.map((r) => { const k = r.gclfCd + "|" + r.year, d = det[k], p = prb[k];
  let prtn = [];
  if (d && d.prtn) { let arr = d.prtn; if (typeof arr === "string") { try { arr = JSON.parse(arr.replace(/'/g, '"')); } catch (e) { arr = []; } } prtn = (arr || []).map((x) => ({ 기간: dec(x.prjtPerd), 내용: mask(x.prtnInfo).slice(0, 110) })); }
  return { y: +r.year, id: r.gclfCd, nm: dec(r.plcNm), 부서: dec(r.chgrDeptNm).replace(/^행정안전부\s*/, ""), 담당: roles(r.chgrNm), 기간: dec(r.prjtPerd), 선정: dec(r.slctnStdr), 조회: +r.inqCnt || 0, 개요: mask(r.prjtSmry).slice(0, 140), 추진실적: prtn, 원문연결: d ? +d.wonmunCnt : null, 원문검색: p ? tot(p.orginl) : null, 사전정보: p ? tot(p.prev) : null }; });
const task = P2.과제.find((t) => t.세부.some((s) => s.no === no)); const sub = task ? task.세부.find((s) => s.no === no) : null; const fl = FL.목록.find((x) => x.no === no);
const out = { 작성일: new Date().toISOString().slice(0, 10), 핵심어: kw, 기관: org, 국정과제: task ? { n: task.n, nm: task.nm, org: task.org } : null, 세부과제: sub ? { no: sub.no, t: sub.t, 전문: sub.전문 } : null,
  예산: fl ? { j: fl.j, lines: fl.lines.map((l) => ({ nm: l.nm, 단위: l.단위, 억: l.억, 집행률: (sub && sub.예산.lines.find((x) => x.nm === l.nm) || {}).집행률 ?? null })), 집행월: P2.집행월 } : null,
  연도, 미등록: 연도.length ? 연도[연도.length - 1].y < 2026 : true };
fs.writeFileSync(R("notes/report-lineage.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${org} '${kw}': 카드 ${연도.length}건 ${연도.map((c) => c.y).join("→")} · 2025 추진실적 ${(연도.find((c) => c.y === 2025) || {}).추진실적?.length || 0}건`);
const leak = JSON.stringify(out).match(/[가-힣]{2,4}\s?(과장|사무관|주무관|서기관|국장|팀장)/g); console.log("실명 의심:", leak ? leak.slice(0, 5) : "없음");
