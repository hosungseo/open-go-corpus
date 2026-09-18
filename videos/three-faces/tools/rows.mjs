/* 비교표·3×3 표의 행 위치를 표 기준 %로 잰다 → assets/rows.js (영상에서 행 하이라이트 좌표) */
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })).newPage();
const SITE = 'http://127.0.0.1:8791/report.html';
const rowsOf = async (hash, tableSel, rowSel) => {
  await p.goto(`${SITE}?v=${Date.now()}#${encodeURIComponent(hash)}`, { waitUntil: 'load' }); await p.waitForTimeout(900);
  return p.evaluate(([t, r]) => { const T = document.querySelector(t).getBoundingClientRect();
    return [...document.querySelectorAll(t + ' ' + r)].map((e) => { const R = e.getBoundingClientRect(); return { k: (e.querySelector('td.k,th.k,.q,div:first-child')?.textContent || '').trim().slice(0, 12), y: +((R.top - T.top) / T.height * 100).toFixed(2), h: +(R.height / T.height * 100).toFixed(2) }; }); }, [tableSel, rowSel]);
};
const out = { cmp: await rowsOf('비교', '#s3 table.cmp', 'tbody tr'), qa3: await rowsOf('같은사업', '#qa3', '.row') };
fs.writeFileSync('assets/rows.js', 'window.ROWS=' + JSON.stringify(out) + ';\n');
console.log(JSON.stringify(out));
await b.close();
