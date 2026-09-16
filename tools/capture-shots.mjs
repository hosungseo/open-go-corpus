// 설명자료용 화면 갈무리. 인쇄에 쓰므로 2배 해상도로 뜬다.
// 사용: node tools/capture-shots.mjs [베이스URL]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = path.join(ROOT, "brief/shots");
const BASE = process.argv[2] || "http://localhost:8931";
fs.mkdirSync(OUT, { recursive: true });

const settle = async (p) => {
  // 인쇄용이라 흐르는 애니메이션과 등장 효과는 멈춘다
  await p.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important}" +
      ".js .io{opacity:1!important;transform:none!important;filter:none!important}" +
      ".js .tiles .tile,.js .fgrid .fcard{opacity:1!important;transform:none!important}",
  });
  // 고정(sticky) 배치를 풀어 둔다. 긴 구간을 잘라 찍을 때 상단 바가 그림 한가운데로 끼어든다.
  await p.evaluate(() => {
    document.querySelectorAll("*").forEach((el) => {
      if (getComputedStyle(el).position === "sticky") el.style.position = "static";
    });
  });
  await p.waitForTimeout(500);
};
const ready = async (p) => {
  await p
    .waitForFunction(() => !document.querySelector("#detail .placeholder"), null, { timeout: 15000 })
    .catch(() => {});
  await p.waitForTimeout(500);
};

// maxH는 CSS 픽셀 기준이다. 2배 해상도라 결과 PNG 높이는 그 두 배가 된다.
// sel: 한 요소 / range: [처음, 끝] 두 요소를 잇는 구간 / null: 화면 한 판
// marks: 주석을 달 지점. [번호표시위치 선택자, 가로치우침] — 크롭 대비 백분율로 기록된다
const MARKS = {
  "compare-matrix": [".mx tbody tr:nth-child(1) td.k", ".mx tbody tr:nth-child(1) td:nth-child(2)", ".mx tbody tr:nth-child(3) td:nth-child(2)", ".mx tbody tr:nth-child(9) td:nth-child(4)"],
  "compare-l2": ["#tabs button[data-d='use']", ".detail .dh h3", ".detail .col.rn .who", ".detail .col.og .who"],
  "history-timeline": [".lane.rn .nd:nth-of-type(1)", ".lane.rn .nd:nth-of-type(3)", ".lane.og .nd:nth-of-type(1)", ".lane.pv .nd:nth-of-type(1)"],
  "index-three": [".three .tc.pv h3", ".three .tc.og h3", ".three .tc.rn h3", ".three .tc.rn .fact"],
  "explorer-rows": ["#detail .cols .col.rn .c", "#detail .cols .col.pv .c", "#detail .cols .col.og .c"],
  "policy2-split": [".rn2 .tl .yr:nth-of-type(1)", ".rn2 .node.main", ".rn2 .vw .ph", ".rn2 .state"],
  "policy2-three": [".rn2 .pt3 > div:nth-child(1)", ".rn2 .pt3 > div:nth-child(2)", ".rn2 .pt3 > div:nth-child(3)"],
  "policy2-head": [".rn2 .st.big:nth-of-type(3)", ".rn2 .st.big.w"],
  "history-list-2014": ["#ev-original-2014-03-01 .who", "#ev-realname-2014-11-19 .chg"],
  "history-list-top": ["#ev-realname-1998-07-01 .why", "#ev-preinfo-2004-07-30 .who"],
  "explorer-orgs": ["#matrix thead th:nth-child(1)", "#matrix thead th:nth-last-child(2)", "#matrix tbody tr:nth-child(1) td:nth-child(1)"],
};
const marksOut = {};

const SHOTS = [
  // 표지용 축소 썸네일 — 화면 한 판만
  ["thumb-index", "/", { w: 1180, h: 760 }, null],
  ["thumb-compare", "/compare.html", { w: 1180, h: 760 }, null],
  ["thumb-history", "/history.html", { w: 1180, h: 760 }, null],
  ["thumb-explorer", "/explorer/", { w: 1180, h: 760 }, ready],
  ["thumb-policy2", "/policy2.html", { w: 1320, h: 760 }, null],
  // 본문용 크롭
  ["index-three", "/", { w: 1180, sel: ".three" }, null],
  ["compare-matrix", "/compare.html", { w: 1180, sel: "#matrix .mx" }, null],
  ["compare-l2", "/compare.html", { w: 1180, sel: "#l2" }, async (p) => {
    await p.click('#tabs button[data-d="use"]').catch(() => {});
    await p.waitForTimeout(400);
  }],
  ["history-timeline", "/history.html", { w: 1180, sel: "#timeline .tl" }, null],
  ["history-list-top", "/history.html", { w: 1180, range: ["#ev-realname-1998-07-01", "#ev-realname-2006-07-01"] }, null],
  ["history-list-2014", "/history.html", { w: 1180, range: ["#ev-original-2014-03-01", "#ev-realname-2017-07-26"] }, null],
  ["explorer-rows", "/explorer/", { w: 1180, sel: "#detail", maxH: 1150 }, ready],
  ["explorer-orgs", "/explorer/", { w: 1180, sel: "#matrix", maxH: 620 }, ready],
  ["policy2-head", "/policy2.html", { w: 1320, sel: ".rn2 .hd" }, null],
  ["policy2-split", "/policy2.html", { w: 1320, sel: ".rn2 .split", maxH: 700 }, null],
  ["policy2-2026", "/policy2.html", { w: 1320, sel: ".rn2 .node.ghost" }, null],
  ["policy2-three", "/policy2.html", { w: 1320, sel: ".rn2 .pt3" }, null],
];

const browser = await chromium.launch();
for (const [name, url, opt, prep] of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: opt.w, height: opt.h || 1100 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  await settle(page);
  if (prep) await prep(page);
  const file = path.join(OUT, name + ".png");
  try {
    if (opt.range) {
      const box = await page.evaluate(([a, b]) => {
        const x = document.querySelector(a), y = document.querySelector(b);
        if (!x || !y) return null;
        const r1 = x.getBoundingClientRect(), r2 = y.getBoundingClientRect();
        const sx = scrollX, sy = scrollY;
        return { x: Math.min(r1.left, r2.left) + sx, y: r1.top + sy, width: Math.max(r1.width, r2.width), height: r2.top + sy - (r1.top + sy) };
      }, opt.range);
      if (!box) throw new Error("구간을 찾지 못함");
      await page.screenshot({ path: file, clip: box, fullPage: true });
    } else if (opt.sel) {
      const el = await page.waitForSelector(opt.sel, { timeout: 8000 });
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      if (opt.maxH) {
        const b = await el.boundingBox();
        const sy = await page.evaluate(() => scrollY);
        await page.screenshot({ path: file, clip: { x: b.x, y: b.y + sy, width: b.width, height: Math.min(b.height, opt.maxH) }, fullPage: true });
      } else {
        await el.screenshot({ path: file });
      }
    } else {
      await page.screenshot({ path: file });
    }
    // 주석 좌표를 크롭 기준 백분율로 기록
    if (MARKS[name]) {
      const origin = await page.evaluate((o) => {
        const sx = scrollX, sy = scrollY;
        if (o.range) { const x = document.querySelector(o.range[0]); const r = x.getBoundingClientRect();
          const y = document.querySelector(o.range[1]).getBoundingClientRect();
          return { x: r.left + sx, y: r.top + sy, w: Math.max(r.width, y.width), h: y.top + sy - (r.top + sy) }; }
        const el = document.querySelector(o.sel); const r = el.getBoundingClientRect();
        return { x: r.left + sx, y: r.top + sy, w: r.width, h: o.maxH ? Math.min(r.height, o.maxH) : r.height };
      }, opt);
      const pts = await page.evaluate(({ sels, origin }) => sels.map((s) => {
        const el = document.querySelector(s); if (!el) return null;
        const r = el.getBoundingClientRect();
        // 번호는 대상의 왼쪽 위 모서리에 걸친다. 가운데에 두면 글자를 덮는다.
        return { x: +(((r.left + scrollX) - origin.x) / origin.w * 100).toFixed(2),
                 y: +(((r.top + scrollY) - origin.y) / origin.h * 100).toFixed(2) };
      }), { sels: MARKS[name], origin });
      marksOut[name] = pts;
    }
    console.error(`  ${name}.png  ${(fs.statSync(file).size / 1024).toFixed(0)}KB${MARKS[name] ? "  주석 " + (marksOut[name] || []).filter(Boolean).length : ""}`);
  } catch (e) {
    console.error(`  ${name} 실패: ${e.message.split("\n")[0]}`);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marksOut, null, 1));
console.error(`\n갈무리 ${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length}장 · 주석 좌표 ${Object.keys(marksOut).length}세트`);
