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
  // 연결 문서: 제목과 결재선 직위만. 이름은 버린다.
  let docs = [];
  if (d && d.wonmun) { let arr = d.wonmun; if (typeof arr === "string") { try { arr = JSON.parse(arr.replace(/'/g, '"')); } catch (e) { arr = []; } }
    const roleOf = (seg) => { const m = seg.match(/(주무관|행정사무관|사무관|서기관|담당관|과장|국장|실장|팀장)/); const k = seg.match(/\((기안|검토|전대결|대결|전결|협조|결재)\)/); return (k ? k[1] + " " : "") + (m ? m[1] : "담당"); };
    docs = (arr || []).map((x) => ({ id: x.prdnNstRgstNo, 제목: mask(x.infoSj).slice(0, 60), 결재선: dec(x.aprvInfo).split(">").map((s) => roleOf(s.trim())).join(" › "), 원문: x.urtxtYn === "Y", 일자: String(x.prdnDt || "").replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3"), 사유: dec(x.listClsdrResnDtls) || null })); }
  const pv = p && p.prev && p.prev.items && p.prev.items[0] ? { 제목: dec(p.prev.items[0].title), 부서: dec(p.prev.items[0].dept), 내용: dec(p.prev.items[0].detail), 조회: +p.prev.items[0].inq || 0 } : null;
  const og = p && p.orginl && p.orginl.items && p.orginl.items[0] ? { 제목: mask(p.orginl.items[0].title), 부서: dec(p.orginl.items[0].dept), 일자: String(p.orginl.items[0].date || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") } : null;
  return { y: +r.year, id: r.gclfCd, nm: dec(r.plcNm), 부서: dec(r.chgrDeptNm).replace(/^행정안전부\s*/, ""), 담당: roles(r.chgrNm), 기간: dec(r.prjtPerd), 선정: dec(r.slctnStdr), 조회: +r.inqCnt || 0, 개요: mask(r.prjtSmry).slice(0, 140), 배경: mask(r.prtnCtt).slice(0, 120), 추진실적: prtn, 문서: docs, 사전정보항목: pv, 원문항목: og, 원문연결: d ? +d.wonmunCnt : null, 원문검색: p ? tot(p.orginl) : null, 사전정보: p ? tot(p.prev) : null }; });
// 문서는 카드에 매달린 채로 두지 않고 생산 연도로 다시 세운다. 정보목록(§8) 21건은 2025 카드에 "관련 정보목록"으로 붙어 있지만 전부 2026년 문서다.
const pool = 연도.flatMap((c) => (c.문서 || []).map((d) => ({ ...d, 종류: "정보목록" })));
const FO = JSON.parse(fs.readFileSync(R("notes/fund-originals.json"), "utf8")).문서;
const OQ = "curated/orginl-query/" + kw + ".jsonl";
const oq = fs.existsSync(R(OQ)) ? L(OQ) : [];
const mine = oq.filter((r) => r.PROC_INSTT_NM === org);
const 원문 = mine.map((r) => { const f = FO[r.PRDCTN_INSTT_REGIST_NO] || null; return {
  id: r.PRDCTN_INSTT_REGIST_NO, 제목: mask(r.INFO_SJ).slice(0, 70), 부서: dec(r.CHRG_DEPT_NM), 문서번호: dec(r.DOC_NO), 일자: String(r.PRDCTN_DT).replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3"), 생산일시: String(r.PRDCTN_DT), 기관구분: r.INSTT_SE_CD,
  단위업무: dec(r.UNIT_JOB_NM), 공개: r.OTHBC_SE_CD === "1" ? "공개" : r.OTHBC_SE_CD === "2" ? "부분공개" : "공개", 파일: String(r.FILE_NM || "").split("|").map((s) => s.trim()).filter(Boolean),
  결재선: f ? f.결재선 : null, 협조: f ? f.협조 : [], 보존: f ? f.보존 : null, 쪽: f ? f.쪽 : [], 첨부표시: f ? f.첨부표시 : null, 종류: "원문공개" }; }).sort((a, b) => a.일자.localeCompare(b.일자));
const others = oq.filter((r) => r.PROC_INSTT_NM !== org);
const byYear = {}; for (const r of others) { const y = String(r.PRDCTN_DT).slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
const byInst = {}; for (const r of others) byInst[r.PROC_INSTT_NM] = (byInst[r.PROC_INSTT_NM] || 0) + 1;
const 타기관 = { 총: others.length, 연도별: byYear, 상위: Object.entries(byInst).sort((a, b) => b[1] - a[1]).slice(0, 6) };
const yearOf = (d) => +String(d.일자 || "").slice(0, 4);
for (const c of 연도) { c.문서 = pool.filter((d) => yearOf(d) === c.y); c.원문 = 원문.filter((d) => yearOf(d) === c.y); c.타기관 = byYear[String(c.y)] || 0; }
const lastY = 연도.length ? 연도[연도.length - 1].y : 0;
const 미등록문서 = { y: lastY + 1, 문서: pool.filter((d) => yearOf(d) > lastY), 원문: 원문.filter((d) => yearOf(d) > lastY), 타기관: byYear[String(lastY + 1)] || 0 };
const task = P2.과제.find((t) => t.세부.some((s) => s.no === no)); const sub = task ? task.세부.find((s) => s.no === no) : null; const fl = FL.목록.find((x) => x.no === no);
const out = { 작성일: new Date().toISOString().slice(0, 10), 핵심어: kw, 기관: org, 국정과제: task ? { n: task.n, nm: task.nm, org: task.org } : null, 세부과제: sub ? { no: sub.no, t: sub.t, 전문: sub.전문 } : null,
  예산: fl ? { j: fl.j, lines: fl.lines.map((l) => ({ nm: l.nm, 단위: l.단위, 억: l.억, 집행률: (sub && sub.예산.lines.find((x) => x.nm === l.nm) || {}).집행률 ?? null })), 집행월: P2.집행월 } : null,
  연도, 미등록: 연도.length ? 연도[연도.length - 1].y < 2026 : true, 미등록문서, 타기관, 원문받은날: JSON.parse(fs.readFileSync(R("notes/fund-originals.json"), "utf8")).받은날 };
// 같은 사업의 세 얼굴 — 질문 셋. 판정과 문장은 위 자료에서 그대로 옮긴 사실이다.
const L25 = 연도.find((c) => c.y === 2025) || {}; const nDoc = L25.원문연결 || 0; const acts = L25.추진실적 || []; const pvi = L25.사전정보항목; const ogi = L25.원문항목;
const kdate = (s) => s.replace(/^[‘']?(\d{2})\.(\d{2})\.(\d{2})$/, (m, y, mo, d) => +mo + "월 " + +d + "일");
out.질문 = [
  { q: "이 기금, 누가 맡았나요?", 답: {
    rn: { 판정: "답함", 말: L25.부서 + " " + (L25.담당 || "").replace(/ \d/g, "") .replace(/·/g, "·") + "이 적혀 있고, 결재는 과장이 했습니다." },
    pv: { 판정: "부서까지", 말: (pvi ? pvi.부서 : L25.부서) + "가 담당한다고만 적혀 있습니다." },
    og: { 판정: "흩어짐", 말: "문서 " + nDoc + "건마다 결재선(기안 주무관 › 검토 사무관 › 전결 과장)이 있습니다. 하나씩 여시면 됩니다." } } },
  { q: "우리 지역은 어떻게 배분받나요?", 답: {
    rn: { 판정: "일부", 말: "연 1조원, 광역 25%·기초 75%, 기초는 투자계획 평가로 차등. 우리 지역 액수는 없습니다." },
    pv: { 판정: "답함", 말: pvi ? "행정안전부 누리집 안내에 " + pvi.내용.replace(/\s*등\s*$/, "") + "이 있습니다(조회 " + pvi.조회 + "회)." : "안내 항목이 없습니다." },
    og: { 판정: "간접", 말: ogi ? "「" + ogi.제목 + "」(" + ogi.일자 + ") 같은 절차 문서에 일부. 액수는 없습니다." : "절차 문서에 일부 있습니다." } } },
  { q: "언제 무엇을 결정했나요?", 답: {
    rn: { 판정: "일부 · 연 단위", 말: "2025년 조치 " + acts.length + "건에 날짜가 있습니다(" + (acts.length ? kdate(acts[acts.length - 1].기간) + " 워크숍 ~ " + kdate(acts[0].기간) + " 배분 기준 개정안 보고" : "") + "). 연 1회 등록이라 2026년은 없습니다." },
    pv: { 판정: "못 답함", 말: "결정 과정은 다루지 않습니다." },
    og: { 판정: "답함", 말: (ogi ? ogi.일자 + " 「" + ogi.제목 + "」 전결. " : "") + "정부출연금 지출 요청 1~3차, 배분 기준 고시 개정도 문서로 있습니다." } } },
];
fs.writeFileSync(R("notes/report-lineage.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${org} '${kw}': 카드 ${연도.length}건 ${연도.map((c) => c.y).join("→")} · 2025 추진실적 ${(연도.find((c) => c.y === 2025) || {}).추진실적?.length || 0}건`);
const leak = JSON.stringify(out).match(/[가-힣]{2,4}\s?(과장|사무관|주무관|서기관|국장|팀장)/g); console.log("실명 의심:", leak ? leak.slice(0, 5) : "없음");
