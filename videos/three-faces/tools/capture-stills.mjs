#!/usr/bin/env node
/* 정지 캡처 5장 — report.html 을 1440 폭 @2x 로 열어 요소 단위로 찍는다. 사용: node tools/capture-stills.mjs */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const C = (f) => path.join(ROOT, 'capture', f);
const SITE = process.env.SITE || 'http://127.0.0.1:8791/report.html';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
const p = await ctx.newPage();
await p.addStyleTag({ content: '' }).catch(() => {});
const go = async (hash) => { await p.goto(`${SITE}?v=${Date.now()}#${hash}`, { waitUntil: 'load' }); await p.waitForTimeout(900); };
const shot = async (sel, file) => { const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: C(file) }); console.log('  ', file); };

await go('결론');
await shot('#s1 .cards, #s1 .c3, #s1 > div:nth-of-type(1)', '01-cards.png').catch(async () => { await shot('#s1', '01-cards.png'); });
await p.screenshot({ path: C('10-conclusion.png'), fullPage: false }); console.log('   10-conclusion.png');

await go('같은사업');
await shot('#qa3', '05-table-full.png');

await go('2.0');
await shot('#rnVw', '04-viewer.png');
await p.click('#rnAllClose'); await p.waitForTimeout(500);
await shot('#rnTl', '07-lineage.png');
await p.screenshot({ path: C('07-screen.png'), fullPage: false }); console.log('   07-screen.png');

await b.close();
