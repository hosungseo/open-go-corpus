// 설명자료를 A4 PDF로 뽑는다. 사용: node tools/build-brief-pdf.mjs [베이스URL]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE = process.argv[2] || "http://localhost:8931";
const OUT = path.join(ROOT, "brief/정보공개-3개제도-실태조사-설명자료.pdf");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
await page.goto("file://" + path.join(ROOT, "brief/brief.html"), { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 배치 점검 — 쪽마다 넘침이 없는지
const check = await page.evaluate(() => {
  const pgs = [...document.querySelectorAll(".pg")];
  const mm = (px) => +(px / (96 / 25.4)).toFixed(0);
  return {
    쪽수: pgs.length,
    주석: document.querySelectorAll(".mk").length,
    이미지: document.querySelectorAll(".shot img").length,
    깨진이미지: [...document.querySelectorAll("img")].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")),
    넘친쪽: pgs.map((p, i) => ({ i: i + 1, h: mm(p.scrollHeight) })).filter((x) => x.h > 297),
  };
});
console.error("배치 점검:", JSON.stringify(check, null, 1));

await page.pdf({
  path: OUT,
  format: "A4",
  printBackground: true,
  margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
});
await browser.close();
console.error(`\nPDF → ${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)}MB`);
