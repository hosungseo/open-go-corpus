#!/usr/bin/env node
// Downloads the actual report bodies (본문 PDF) for curated documents and
// extracts their text.
//
// The list API gives metadata only. The body lives behind a 4-step ESB
// pipeline (파일전송 → 파일수신 → 개인정보필터링 → PDF변환) that the portal
// drives from the detail page, so each document costs ~5-10s of real server
// work. That rules out fetching all 52k — this selects the highest-value
// documents first.
//
// Why it is worth it: a single 검토보고 carries the whole 추진경위 —
//   o 산업단지 지정 고시 : '22. 12. 29.
//   o 조성 반대 민원 접수 : '24. 3. 27.
// i.e. the procedural timeline stated outright, not inferred from timestamps.
//
//   node tools/fetch-body.mjs --limit 50 --family 산업단지계획
//   node tools/fetch-body.mjs --limit 200 --minScore 7
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CURATED = path.join(ROOT, "curated");
const DL = path.join(ROOT, "tmp-download");
const OUT = path.join(ROOT, "bodies");
const PDFDIR = path.join(ROOT, "pdf");

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const LIMIT = Number(arg("limit", "50"));
const FAMILY = arg("family", null);
const KEEP_PDF = argv.includes("--keep-pdf");
const HEADFUL = argv.includes("headful");

/* Which documents deserve the server round-trip. */
const FAMILY_RE = {
  "산업단지계획": /산업단지계획|산업단지\s*(개발|지정)/,
  "환경영향평가": /환경영향평가/,
  "재해영향평가": /재해영향평가/,
  "교통영향평가": /교통영향평가/,
  "실시계획": /실시계획/,
  "도시관리계획": /도시관리계획|지구단위계획/,
  "사업인정·보상": /사업인정|보상계획|수용재결/,
  "전력·에너지": /전원개발|송전|변전소|전력계통/,
  "군공항·종전부지": /군\s*공항|종전부지|기부\s*대\s*양여/,
  "반도체·첨단": /반도체|첨단전략|특화단지/,
};
// A 검토보고/계획 states the full 추진경위; a mere 고시 usually does not.
const NARRATIVE = /검토\s*보고|추진\s*계획|기본\s*계획|계획\s*보고|결과\s*보고|심의\s*(안건|계획)|타당성/;

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

/* ── pick targets ── */
const seen = new Set();
const targets = [];
for (const f of files(CURATED)) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const id = r.PRDCTN_INSTT_REGIST_NO;
    if (!id || seen.has(id)) continue;
    const title = r.INFO_SJ || "";
    const fam = Object.entries(FAMILY_RE).find(([, re]) => re.test(title))?.[0];
    if (!fam) continue;
    if (FAMILY && fam !== FAMILY) continue;
    if (!/\.(pdf|hwp|hwpx|hwtx|odt|docx|xlsx|mht|zip)/i.test(r.FILE_NM || "")) continue;
    seen.add(id);
    targets.push({
      id, fam, title,
      prdnDt: r.PRDCTN_DT, nstSeCd: r.INSTT_SE_CD,
      inst: r.PROC_INSTT_NM, dept: r.CHRG_DEPT_NM,
      docNo: r.DOC_NO, unit: r.UNIT_JOB_NM,
      score: (NARRATIVE.test(title) ? 2 : 0) + (r.PRDCTN_DT || "").slice(0, 4) / 1000,
    });
  }
}
targets.sort((a, b) => b.score - a.score);

const stateFile = path.join(ROOT, "state", "bodies.json");
mkdirSync(path.dirname(stateFile), { recursive: true });
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { done: {}, failed: {} };
const pending = targets.filter((t) => !state.done[t.id] && !state.failed[t.id]).slice(0, LIMIT);
console.log(`후보 ${targets.length} · 완료 ${Object.keys(state.done).length} · 이번 실행 ${pending.length}`);

/* ── browser ── */
mkdirSync(DL, { recursive: true });
mkdirSync(OUT, { recursive: true });
if (KEEP_PDF) mkdirSync(PDFDIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: !HEADFUL });
const ctx = await browser.newContext({ acceptDownloads: true, locale: "ko-KR" });
const page = await ctx.newPage();
page.on("dialog", (d) => d.dismiss().catch(() => {}));   // never let a modal block us

// Every format the portal serves goes through one extractor (see extract.py).
const EXTRACT = path.join(ROOT, "tools", "extract.py");
const HWP_EXT = new Set([".hwp", ".hwpx", ".hwtx", ".hml"]);
const fileText = (file, ext) => {
  const meta = HWP_EXT.has(ext);   // rhwp also yields normalised dates + tables
  try {
    const out = execFileSync("python3", meta ? [EXTRACT, file, "--meta"] : [EXTRACT, file], {
      encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 240000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!meta) return { text: out };
    const j = JSON.parse(out);
    const m = Object.values(j.meta || {})[0] || {};
    return { text: (j.text || "").trim(), dates: m.dates, tables: m.tables };
  } catch { return { text: "" }; }
};

const outFile = path.join(OUT, "bodies.jsonl");
let ok = 0, fail = 0;
for (const [i, t] of pending.entries()) {
  const url = `https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=${t.id}&prdnDt=${t.prdnDt}&nstSeCd=${t.nstSeCd || "W"}&title=%EC%9B%90%EB%AC%B8%EC%A0%95%EB%B3%B4`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    // The detail page holds the file hashes the download pipeline needs, one
    // per file. 본문 is the rendered summary; 붙임 is usually the real document
    // (a 27KB 본문 PDF routinely ships beside a 1.3MB HWPX plan), so take all.
    const files = await page.evaluate(() => {
      const kindOf = (el) => {
        const th = el.closest("tr")?.querySelector("th")?.textContent?.trim() || "";
        return th.includes("붙임") || th.includes("첨부") ? "첨부" : "본문";
      };
      return [...document.querySelectorAll("a")]
        .filter((x) => /wonmunStep1\(/.test(x.getAttribute("onclick") || ""))
        .map((a) => {
          const m = a.getAttribute("onclick").match(/wonmunStep1\('([^']+)',\s*'([^']+)',\s*'([^']*)'/);
          return m ? { fileId: m[1], fileName: m[2], isPdf: m[3], kind: kindOf(a) } : null;
        })
        .filter(Boolean)
        // One hash per file: the same file exposes both 다운로드 and 뷰어보기.
        .filter((f, i, arr) => arr.findIndex((g) => g.fileId === f.fileId) === i);
    });
    if (!files.length) throw new Error("no download link");

    const meta = await page.evaluate(() => {
      const pick = (label) => {
        const th = [...document.querySelectorAll("th,dt,strong")].find((e) => e.textContent.trim() === label);
        return th?.nextElementSibling?.textContent.replace(/\s+/g, " ").trim() || "";
      };
      return { charger: pick("담당자명"), preserve: pick("보존기간"), open: pick("공개여부") };
    });

    const docs = [];
    for (const [fi, file] of files.entries()) {
      const ext = (file.fileName.match(/\.[A-Za-z0-9]+$/) || [".bin"])[0].toLowerCase();
      try {
        // Each file is regenerated server-side on demand; the popup must
        // settle between requests or the second click is ignored.
        if (fi) await page.waitForTimeout(1500);
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 120000 }),
          page.evaluate((f) => window.wonmunStep1(f.fileId, f.fileName, f.isPdf), file),
        ]);
        const saved = path.join(DL, `${t.id}-${fi}${ext}`);
        await download.saveAs(saved);
        const { text, dates, tables } = fileText(saved, ext);
        if (KEEP_PDF && text) writeFileSync(path.join(PDFDIR, `${t.id}-${fi}${ext}`), readFileSync(saved));
        rmSync(saved, { force: true });
        if (text) docs.push({ kind: file.kind, fileName: file.fileName, ext, chars: text.length, text, dates, tables });
      } catch (e) {
        docs.push({ kind: file.kind, fileName: file.fileName, ext, error: String(e).slice(0, 60) });
      }
    }
    const got = docs.filter((d) => d.text);
    if (!got.length) throw new Error(docs[0]?.error || "empty text");

    appendFileSync(outFile, JSON.stringify({
      id: t.id, family: t.fam, title: t.title, prdnDt: t.prdnDt,
      inst: t.inst, dept: t.dept, docNo: t.docNo, unit: t.unit,
      ...meta,
      files: docs.map((d) => ({ kind: d.kind, fileName: d.fileName, ext: d.ext, chars: d.chars || 0, error: d.error })),
      // rhwp-normalised dates/tables from the HWP-family files — the
      // structured half a plain text dump throws away.
      dates: got.flatMap((d) => d.dates || []),
      tables: got.flatMap((d) => d.tables || []),
      chars: got.reduce((a, d) => a + d.chars, 0),
      text: got.map((d) => `[${d.kind} ${d.fileName}]\n${d.text}`).join("\n\n"),
    }) + "\n");
    state.done[t.id] = { at: new Date().toISOString().slice(0, 19), files: got.length, chars: got.reduce((a, d) => a + d.chars, 0) };
    ok++;
    console.log(`  ${i + 1}/${pending.length} [${t.fam}] ${got.map((d) => `${d.ext.slice(1)}:${d.chars}자`).join(" + ")} · ${t.title.slice(0, 40)}`);
  } catch (e) {
    state.failed[t.id] = String(e).slice(0, 100);
    fail++;
    console.log(`  ${i + 1}/${pending.length} FAIL ${String(e).slice(0, 50)} · ${t.title.slice(0, 34)}`);
  }
  if ((i + 1) % 5 === 0) writeFileSync(stateFile, JSON.stringify(state, null, 1));
}
writeFileSync(stateFile, JSON.stringify(state, null, 1));
await browser.close().catch(() => {});
rmSync(DL, { recursive: true, force: true });
console.log(`본문 확보 ${ok} · 실패 ${fail} → ${outFile}`);
