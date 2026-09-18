#!/usr/bin/env node
/* 보고 사이트의 "실제 화면 뜯어보기"용 사진을 정보공개포털·행안부 누리집에서 직접 찍는다.
 *
 *   node tools/capture-screens.mjs [ent|rn|pv|og ...]
 *
 * - 찍기 전에 성명 치환을 주입한다(직위 앞 2~4자 한글 → ○○○, 「담당자명」 칸). 직위·역할·부서는 남긴다.
 * - 관심 영역만 잘라 2배 해상도로 저장한다(지시선을 얹으려면 글자가 읽혀야 한다).
 * - 결과: docs/assets/screens/<id>.png  +  notes/screens.json (무엇을 찍었는지·크기)
 * 다시 찍어도 같은 파일명이 나오도록 id 를 고정한다.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "assets", "screens");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);
const shots = [];

/* 성명 치환 — videos/three-faces/tools/rec-lib.mjs 와 같은 규칙 */
const MASK = () => {
  const RE = /(^|[\s>,(·，])([가-힣]{2,4})(?=\s+[가-힣]*(주무관|사무관|서기관|과장|국장|실장|담당관|직무대리|차관보|팀장|장관|차관)(?![가-힣]))/g;
  const maskNode = (n) => {
    if (n.nodeType === 3) { const v = n.nodeValue; if (v && /[가-힣]/.test(v)) { const m = v.replace(RE, "$1○○○"); if (m !== v) n.nodeValue = m; } return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.tagName)) return;
    for (const c of n.childNodes) maskNode(c);
  };
  const maskLabelled = () => {
    for (const th of document.querySelectorAll("th,dt")) {
      if (/^(담당자명|담당자|기안자|결재자)$/.test(th.textContent.trim())) {
        const td = th.nextElementSibling; if (!td) continue;
        const v = td.textContent.trim();
        if (v && !/○/.test(v) && !/(주무관|사무관|서기관|과장|국장|실장|담당관)/.test(v)) td.textContent = "○○○";
      }
    }
  };
  const run = () => { maskNode(document.body); maskLabelled(); };
  window.__mask = run;
  addEventListener("DOMContentLoaded", () => {
    run();
    new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) maskNode(n); if (m.type === "characterData") maskNode(m.target); } maskLabelled(); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: "ko-KR" });
await ctx.addInitScript(MASK);
const page = await ctx.newPage();

const settle = async (ms = 2000) => { await page.waitForTimeout(ms); await page.evaluate(() => window.__mask && window.__mask()).catch(() => {}); };

/** 주어진 글월들을 모두 품는 가장 작은 영역을 찾아 여백을 두고 자른다 */
const clipOf = async (texts, pad = 14) => page.evaluate(([texts, pad]) => {
  const has = (el, t) => el.textContent && el.textContent.includes(t);
  let best = null;
  for (const el of document.querySelectorAll("table,section,div,ul,form,article,tbody")) {
    if (!texts.every((t) => has(el, t))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 40) continue;
    const area = r.width * r.height;
    if (!best || area < best.area) best = { area, x: r.x, y: r.y, w: r.width, h: r.height };
  }
  if (!best) return null;
  return { x: Math.max(0, best.x - pad), y: Math.max(0, best.y + window.scrollY - pad), w: best.w + pad * 2, h: best.h + pad * 2 };
}, [texts, pad]);

/** CSS 선택자로 영역을 잡는다 */
const clipSel = async (sel, pad = 14) => page.evaluate(([sel, pad]) => {
  const el = document.querySelector(sel); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y + window.scrollY - pad), w: r.width + pad * 2, h: r.height + pad * 2 };
}, [sel, pad]);

/** 목록에서 앞의 n 줄만 */
const clipRows = async (sel, n, pad = 10) => page.evaluate(([sel, n, pad]) => {
  const list = document.querySelector(sel); if (!list) return null;
  const rows = [...list.children].slice(0, n); if (!rows.length) return null;
  const a = rows[0].getBoundingClientRect(), z = rows[rows.length - 1].getBoundingClientRect();
  if (a.width < 200) return null;
  return { x: Math.max(0, a.x - pad), y: Math.max(0, a.y + window.scrollY - pad), w: a.width + pad * 2, h: (z.bottom - a.top) + pad * 2 };
}, [sel, n, pad]);

/** clip 은 문서 좌표. 그 영역이 화면에 들어오도록 스크롤한 뒤 찍는다 */
const anchorsOf = async (clip, anchors) => {
  if (!anchors || !anchors.length) return [];
  return page.evaluate(([clip, anchors]) => anchors.map(([key, text, mode]) => {
    const cands = [...document.querySelectorAll("th,td,dt,dd,strong,b,a,span,li,div,p,h1,h2,h3,label,button,input")]
      .filter((e) => { const t = (e.tagName === "INPUT" ? e.value : e.textContent) || ""; return mode === "eq" ? t.trim() === text : t.includes(text); })
      .filter((e) => e.getBoundingClientRect().width > 8);
    // 가장 작은(=가장 구체적인) 것을 고른다
    const el = cands.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return A.width * A.height - B.width * B.height; })[0];
    if (!el) return { key, miss: true };
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + window.scrollY + r.height / 2;
    return { key, x: +(((cx - clip.x) / clip.w) * 100).toFixed(2), y: +(((cy - clip.y) / clip.h) * 100).toFixed(2) };
  }), [clip, anchors]);
};

/** 너무 긴 영역은 위에서부터 maxH(px)만 쓴다 */
const cap = (clip, maxH) => clip ? { ...clip, h: Math.min(clip.h, maxH) } : clip;

const shot = async (id, clip, note, anchors) => {
  if (!clip) { console.log("  SKIP", id, "— 영역을 찾지 못함"); return; }
  const H = 1000;
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, clip.y - 20));
  await page.waitForTimeout(400);
  // 페이지가 그만큼 스크롤되지 않을 수 있다(내용이 짧을 때) — 실제 스크롤 값으로 다시 잰다
  const cur = await page.evaluate(() => window.scrollY);
  const y = clip.y - cur;
  const h = Math.min(clip.h, H - y - 4);
  const file = path.join(OUT, id + ".png");
  await page.screenshot({ path: file, clip: { x: Math.round(clip.x), y: Math.round(Math.max(0, y)), width: Math.round(Math.min(clip.w, 1440 - clip.x)), height: Math.round(h) } });
  const px = fs.statSync(file).size;
  const pins = (await anchorsOf({ ...clip, h }, anchors)).filter((a) => !a.miss && a.y >= -2 && a.y <= 102);
  shots.push({ id, note, w: Math.round(clip.w), h: Math.round(h), bytes: px, pins });
  if (anchors && anchors.length) console.log("    핀", pins.map((p) => p.key + "(" + p.x + "," + p.y + ")").join(" "));
  console.log(`  ${id}  ${Math.round(clip.w)}×${Math.round(h)}  ${(px / 1024).toFixed(0)}KB  ${note}`);
};

const go = async (url, wait = 2500) => { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {}); await settle(wait); };

/* ─────────────────────────────  입구 3장  ───────────────────────────── */
if (want("ent")) {
  console.log("입구");
  await go("https://www.open.go.kr/othicInfo/plcyChgrRealNm/polRnInsttList.do");
  await shot("ent-rn", await clipOf(["정책실명제", "중앙행정기관"], 16), "정책실명제 입구 — 기관을 고르는 화면");
  await go("https://www.open.go.kr/othicInfo/prevOpenInfo/othinfBefInfList.do");
  await shot("ent-pv", await clipOf(["기관선택", "기간검색"], 16), "사전정보공표 입구 — 검색 화면");
  await go("https://www.open.go.kr/othicInfo/infoList/orginlInfoList.do");
  await shot("ent-og", cap(await clipOf(["기관선택", "공개구분"], 16) || await clipOf(["기관선택", "기간검색"], 16), 300), "원문공개 입구 — 검색 화면");
}

/* ─────────────────────────  정책실명제 3장  ───────────────────────── */
if (want("rn")) {
  console.log("정책실명제");
  await go("https://www.open.go.kr/othicInfo/plcyChgrRealNm/polRnInsttList.do");
  // 1) 기관 목록에서 행정안전부 → 그 기관의 사업 목록
  // 등록연도 기본값이 2026(아직 등록 전)이라 목록이 0건으로 나온다 — 2025로 바꾼 뒤 기관을 연다
  await page.evaluate(() => { const s = document.getElementById("rgstYmd"); if (s) { s.value = "2025"; s.dispatchEvent(new Event("change")); } });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.goList && window.goList("1741000", encodeURIComponent("행정안전부")));
  await settle(4500);

  await shot("rn-1", cap(await clipOf(["정책사업명", "조회수", "선정기준"], 12), 390), "① 사업 목록 — 기관을 고르면 등록된 사업이 줄지어 나온다", [["총건수", "총 27건"], ["사업명", "국민비서"], ["조회수", "조회수", "eq"], ["선정기준", "선정기준", "eq"]]);
  // 2) 사업내역서 · 3) 추진내용
  await go("https://www.open.go.kr/othicInfo/plcyChgrRealNm/polRnInsttDetail.do?gclfCd=TRD2E700C46783187D6BD32FE841953756E&nstCd=1741000&searchNstCd=1741000&rgstYmd=2025", 2500);
  await shot("rn-2", await clipOf(["정책사업명", "담당자", "선정기준"], 14), "② 사업내역서 — 사업 하나의 명부", [["사업명", "정책사업명", "eq"], ["개요", "사업개요", "eq"], ["부서", "균형발전제도과", "eq"], ["담당자", "담당자", "eq"], ["선정기준", "국정과제", "eq"], ["기간", "사업기간", "eq"]]);
  await shot("rn-3", await clipOf(["그간 주요 추진내용", "25.10.28"], 14) || await clipOf(["그간 주요 추진내용"], 14), "③ 그간 주요 추진내용 — 날짜가 있는 조치와 조치마다의 결재선", [["조치", "배분 등에 관한 기준"], ["날짜", "25.10.28"], ["결재선", "차관보직무대리"]]);
  await shot("rn-4", cap(await clipOf(["관련 정보목록", "총"], 14), 520), "④ 관련 정보목록 — 붙어 있으나 열리지 않는 문서 목록", [["머리", "관련 정보목록", "eq"], ["건수", "21"], ["문서", "정부출연금 지출 요청(1차)"], ["결재선", "균형발전제도과장(전결)"]]);
}

/* ────────────────────────  사전정보공표 3장  ──────────────────────── */
if (want("pv")) {
  console.log("사전정보공표");
  await go("https://www.open.go.kr/othicInfo/prevOpenInfo/othinfBefInfList.do");
  await page.fill("#kwd", "지방소멸대응기금").catch(() => {});
  await page.click("#searchBtn").catch(() => {});
  await settle(4500);
  await shot("pv-1", await clipSel("div.result_area", 12), "① 포털의 항목 — 한 줄로 '무엇을 안내하는지'만 적혀 있다", [["건수", "사전정보(1건)"], ["제목", "지방소멸대응기금", "eq"], ["부서", "균형발전제도과"], ["분류", "재정운용"]]);
  // 링크 주소가 보이도록: 항목의 링크 href 를 읽어 화면에 띄운 뒤 찍는다
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((e) => /mois\.go\.kr|localextinction/i.test(e.href || ""));
    return a ? a.href : null;
  });
  console.log("  링크:", href);
  await go("https://www.mois.go.kr/frt/sub/a06/b06/localextinctionFund/screen.do", 3000);
  await shot("pv-2", cap(await clipOf(["업무안내", "추진계획"], 16) || await clipOf(["지방소멸대응기금", "추진계획"], 16), 520), "② 링크를 넘어간 원 사이트 — 내용은 포털이 아니라 부처 누리집에 있다", [["계획", "추진계획"], ["경로", "자치혁신실"], ["일정", "7월, 지방정부"]]);
  await shot("pv-3", await clipOf(["운영 절차"], 16) || await clipOf(["기초지원계정 배분"], 16), "③ 안내 페이지 본문 — 절차와 배분 규모까지 넓게, 그러나 결정 과정은 없다", [["작성", "투자계획(안)"], ["평가", "평가단"], ["심의", "심의위원회"], ["배분", "익년2월"]]);
}

/* ──────────────────────────  원문공개 3장  ────────────────────────── */
if (want("og")) {
  console.log("원문공개");
  await go("https://www.open.go.kr/othicInfo/infoList/orginlInfoList.do");
  await page.fill("#kwd", "지방소멸대응기금").catch(() => {});
  await page.click("#searchBtn").catch(() => {});
  await settle(5000);
  await shot("og-1", await clipRows("div.info_list ul", 4, 10) || await clipSel("div.result_area", 12), "① 검색 결과 — 문서 한 건이 한 줄", [["제목", "집행 및 추진현황 점검"], ["기관", "대구광역시"], ["단위업무", "인구동태업무"], ["날짜", "2026.09.17"]]);
  await go("https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT39FBC7247A6620555EC8313A5E7335A5&prdnDt=20260529174114&nstSeCd=C&title=%EC%9B%90%EB%AC%B8%EC%A0%95%EB%B3%B4", 2500);
  await shot("og-2", await clipOf(["문서번호", "본문파일"], 14), "② 원문정보 상세 — 문서의 이력과 파일", [["제목", "제목", "eq"], ["부서", "균형발전제도과", "eq"], ["문서번호", "균형발전제도과-1644"], ["공개", "공개", "eq"], ["보존", "30년"], ["본문", "본문파일", "eq"], ["붙임", "붙임파일", "eq"]]);
}

await browser.close();
// 일부만 다시 찍어도 나머지 기록이 사라지지 않게 병합한다(여기서 통째로 덮어써 배포본의 목록이 3장으로 줄어든 적이 있다)
const MAN = path.join(ROOT, "notes", "screens.json");
const prev = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, "utf8")) : { 목록: [] };
const merged = [...(prev.목록 || [])];
for (const s of shots) { const i = merged.findIndex((x) => x.id === s.id); if (i >= 0) merged[i] = s; else merged.push(s); }
const ORDER = ["ent-rn", "ent-pv", "ent-og", "rn-1", "rn-2", "rn-3", "rn-4", "pv-1", "pv-2", "pv-3", "og-1", "og-2"];
merged.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
fs.writeFileSync(MAN, JSON.stringify({ 찍은날: new Date().toISOString().slice(0, 10), 배율: 2, 원본폭: 1440, 목록: merged }, null, 1) + "\n");
console.log("목록", merged.length, "장");
console.log("\n→ docs/assets/screens/ · notes/screens.json");
