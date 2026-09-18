#!/usr/bin/env node
/* 다섯 녹화를 순서대로. 사용: node tools/record-all.mjs [rn|pv|og|gap|open ...]
 * 1부 셋은 실제 포털 페이지(성명 치환 주입), 2·3부 둘은 report.html(로컬 8791 서버).
 * 길이는 STORYBOARD 챕터 표와 같다: rn 32 · pv 20 · og 12 · gap 15 · open 9.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record, sleep } from './rec-lib.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const A = (f) => path.join(ROOT, 'assets', f);
const SITE = process.env.SITE || 'http://127.0.0.1:8791/report.html';
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

/* ── 1) 정책실명제 사업내역서 (32s) ── */
if (want('rn')) await record({
  url: 'https://www.open.go.kr/othicInfo/plcyChgrRealNm/polRnInsttList.do',
  out: A('rec-realname.mp4'), tmp: '/private/tmp/tf-rn', waitFor: 'body', settle: 800,
  trim: { start: 0, duration: 41 },
  steps: async ({ page, cursorTo, scrollTo, scrollElTo, box, mark, sleep }) => {
    // 목록으로 세션을 만든 뒤 상세로. 영상은 상세가 자리 잡은 순간부터 쓴다
    await page.goto('https://www.open.go.kr/othicInfo/plcyChgrRealNm/polRnInsttDetail.do?gclfCd=TRD2E700C46783187D6BD32FE841953756E&nstCd=1741000&searchNstCd=1741000&rgstYmd=2025', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#chgrNm', { state: 'visible', timeout: 30000 });
    await page.evaluate(() => window.__mask && window.__mask());
    await sleep(600);
    await cursorTo(1300, 120, 200);
    const start = mark();
    // 0–6 머리 + 사업내역서 상단
    await sleep(6000);
    // 5–13 사업개요 칸 가운데, 정지
    await scrollElTo('text=사업개요', 0.42, 1000); await sleep(9000);
    // 13–19 담당자 행, 커서 머묾
    await scrollElTo('text=담당자', 0.5, 800);
    try { const b = await box('#chgrNm'); await cursorTo(b.x + 40, b.y + b.height / 2, 900); } catch {}
    await sleep(6500);
    // 22–30 추진내용 표, 커서가 결재선 열을 훑음
    await scrollElTo('text=그간 주요 추진내용', 0.12, 1000);
    await cursorTo(1160, 330, 700); await cursorTo(1160, 760, 4200); await sleep(1800);
    // 25–32 관련 정보목록
    await scrollElTo('text=관련 정보목록', 0.1, 1000);
    await cursorTo(1180, 118, 800); await sleep(10000);
    return { trimStart: start };
  },
});

/* ── 2) 행안부 누리집 사전정보공표 (20s) ── */
if (want('pv')) await record({
  url: 'https://www.mois.go.kr/frt/sub/a06/b06/localextinctionFund/screen.do',
  out: A('rec-previnfo.mp4'), tmp: '/private/tmp/tf-pv', waitFor: 'h3, h2, .sub_title, #content', settle: 1200,
  trim: { start: 0, duration: 23 },
  steps: async ({ cursorTo, scrollElTo, mark, sleep }) => {
    await cursorTo(1320, 160, 200);
    const start = mark();
    await sleep(5500);                                   // 0–5.5 제목 · ’26년 추진계획
    await scrollElTo('text=< ’26년도 운영 절차 >', 0.28, 1000).then(async (ok) => { if (!ok) await scrollElTo('text=’26년도 운영 절차', 0.28, 1000); });
    await cursorTo(520, 470, 500); await cursorTo(1250, 470, 4800); await sleep(2000);   // 5.5–14 절차 표를 왼→오른
    await scrollElTo('text=기초지원계정 배분', 0.15, 1000); await sleep(9000);            // 14–23 배분 표
    return { trimStart: start };
  },
});

/* ── 3) 원문정보 상세 (12s) ── */
if (want('og')) await record({
  url: 'https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT39FBC7247A6620555EC8313A5E7335A5&prdnDt=20260529174114&nstSeCd=C&title=%EC%9B%90%EB%AC%B8%EC%A0%95%EB%B3%B4',
  out: A('rec-orginl.mp4'), tmp: '/private/tmp/tf-og', waitFor: 'table', settle: 1000,
  trim: { start: 0, duration: 15 },
  steps: async ({ page, cursorTo, scrollElTo, mark, sleep }) => {
    await scrollElTo('text=원문정보 상세', 0.08, 600);
    await cursorTo(1300, 200, 200);
    const start = mark();
    await sleep(5500);                                   // 0–5.5 표 정지
    // 본문파일 행 → 붙임파일 행으로 커서가 내려온다 (클릭 없음)
    const rows = await page.evaluate(() => [...document.querySelectorAll('th')].filter((t) => /본문파일|붙임파일/.test(t.textContent)).map((t) => { const r = t.nextElementSibling.getBoundingClientRect(); return [r.x + 120, r.y + r.height / 2]; }));
    if (rows[0]) await cursorTo(rows[0][0], rows[0][1], 2200);
    await sleep(2400);
    if (rows[1]) await cursorTo(rows[1][0], rows[1][1], 1800);
    await sleep(3600);
    return { trimStart: start };
  },
});

/* ── 4) 2.0 화면 — 2026 빈칸 + 정보목록 클릭 (15s) ── */
if (want('gap')) await record({
  url: SITE + '?v=' + Date.now() + '#2.0',
  out: A('rec-gap.mp4'), tmp: '/private/tmp/tf-gap', waitFor: '#rnTl .node.ghost', settle: 800, mask: false,
  trim: { start: 0, duration: 24 },
  steps: async ({ page, click, cursorTo, scrollElTo, mark, sleep }) => {
    await scrollElTo('#rnTl .node.ghost', 0.22, 900);
    await cursorTo(700, 200, 200);
    const start = mark();
    await sleep(3500);
    await click('#rnTl .dr[data-doc="DCT61E47222E792A708444B949DFBD4477E"]', 9000, 900);        // 정부출연금 지출 요청(1차) → 비공개
    const open = await page.evaluate(() => { const r = [...document.querySelectorAll('#rnTl .dr')].find((e) => /정부혁신제안/.test(e.textContent)); return r ? r.dataset.doc : null; });
    if (open) await click(`#rnTl .dr[data-doc="${open}"]`, 8500, 900);                           // 공개 · 원문 대상 아님
    await sleep(800);
    return { trimStart: start };
  },
});

/* ── 5) 2.0 화면 — 추진실적 클릭 → 2023 원문 (9s) ── */
if (want('open')) await record({
  url: SITE + '?v=' + Date.now() + '#2.0',
  out: A('rec-open.mp4'), tmp: '/private/tmp/tf-open', waitFor: '#rnTl .bi[data-doc="a2025-0"]', settle: 800, mask: false,
  trim: { start: 0, duration: 9.5 },
  steps: async ({ click, cursorTo, scrollElTo, mark, sleep }) => {
    await scrollElTo('#rnTl .bi[data-doc="a2025-0"]', 0.35, 900);
    await cursorTo(700, 300, 200);
    const start = mark();
    await sleep(1200);
    await click('#rnTl .bi[data-doc="a2025-0"]', 2800, 800);                                       // ’25.10.28 개정(안) 보고
    await click('#rnVb .rr[data-doc="DCT804F1B498D9BF3187B11D9CE98EB9EA9"]', 4600, 900);         // 2023-06-26 원문
    return { trimStart: start };
  },
});
console.log('done');
