#!/usr/bin/env node
// Fetch every file of ONE 원문공개 document by its registration number.
// Same 4-step portal pipeline as fetch-body.mjs (파일전송 → 파일수신 →
// 개인정보필터링 → PDF변환), but for a single, explicitly chosen document
// — used for the 2.0 report screen, where one real original is shown.
//
//   node tools/fetch-one-body.mjs --id DCT... --prdnDt 20260529 --out /path/dir [--nstSeCd W]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const ID = arg("id"), PRDN = arg("prdnDt"), NST = arg("nstSeCd", "W"), OUT = arg("out");
if (!ID || !PRDN || !OUT) { console.error("--id --prdnDt --out required"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ acceptDownloads: true, locale: "ko-KR" });
const page = await ctx.newPage();
page.on("dialog", (d) => d.dismiss().catch(() => {}));

const url = `https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=${ID}&prdnDt=${PRDN}&nstSeCd=${NST}&title=%EC%9B%90%EB%AC%B8%EC%A0%95%EB%B3%B4`;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1500);

// Metadata the detail page shows (labels → next cell). Names are NOT collected.
const meta = await page.evaluate(() => {
  const pick = (label) => {
    const th = [...document.querySelectorAll("th,dt,strong")].find((e) => e.textContent.trim() === label);
    return th?.nextElementSibling?.textContent.replace(/\s+/g, " ").trim() || "";
  };
  return { title: pick("제목"), inst: pick("기관명") || pick("생산기관"), dept: pick("담당부서") || pick("생산부서"), docNo: pick("문서번호"), prdnDt: pick("생산일자") || pick("생산일"), preserve: pick("보존기간"), open: pick("공개여부"), unit: pick("단위업무") || pick("단위과제"), cls: pick("분류") };
});
const files = await page.evaluate(() => {
  const kindOf = (el) => { const th = el.closest("tr")?.querySelector("th")?.textContent?.trim() || ""; return th.includes("붙임") || th.includes("첨부") ? "첨부" : "본문"; };
  return [...document.querySelectorAll("a")]
    .filter((x) => /wonmunStep1\(/.test(x.getAttribute("onclick") || ""))
    .map((a) => { const m = a.getAttribute("onclick").match(/wonmunStep1\('([^']+)',\s*'([^']+)',\s*'([^']*)'/); return m ? { fileId: m[1], fileName: m[2], isPdf: m[3], kind: kindOf(a) } : null; })
    .filter(Boolean)
    .filter((f, i, arr) => arr.findIndex((g) => g.fileId === f.fileId) === i);
});
console.log(JSON.stringify(meta));
console.log("files", files.map((f) => `${f.kind}:${f.fileName}`).join(" | ") || "(none)");

const saved = [];
for (const [fi, file] of files.entries()) {
  const ext = (file.fileName.match(/\.[A-Za-z0-9]+$/) || [".bin"])[0].toLowerCase();
  try {
    if (fi) await page.waitForTimeout(1500);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      page.evaluate((f) => window.wonmunStep1(f.fileId, f.fileName, f.isPdf), file),
    ]);
    const to = path.join(OUT, `${ID}-${fi}${ext}`);
    await download.saveAs(to);
    saved.push({ kind: file.kind, fileName: file.fileName, path: to });
    console.log(`saved ${file.kind} ${file.fileName} → ${to}`);
  } catch (e) { console.log(`FAIL ${file.fileName}: ${String(e).slice(0, 80)}`); }
}
await browser.close().catch(() => {});
console.log(JSON.stringify({ meta, saved }));
