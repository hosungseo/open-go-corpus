#!/usr/bin/env node
// open.go.kr (정보공개포털) bulk collector.
//
// The portal has no public API — data.go.kr only carries yearbook statistics.
// The site's own AJAX endpoints return full JSON but reject session-less
// requests (code 491), so we drive a real Chrome via playwright-core, land on
// the portal once, and issue fetch() from inside the page context.
//
// Modes
//   daily  — sweep every calendar day in a range (no keyword = everything)
//   query  — sweep a keyword list over a long span (for lifecycle tracing)
//
// Both are resumable: finished units are recorded in state/<channel>.json and
// skipped on the next run, so an interrupted sweep costs nothing to restart.
//
//   node tools/collect.mjs --channel orginl --mode daily --from 20260101 --to 20260822
//   node tools/collect.mjs --channel orginl --mode query --queries queries.json --from 20140101
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/* ── channels ──────────────────────────────────────────────────────────── */
const CHANNELS = {
  // 원문정보 — internal approved documents (검토보고·계획·협의·회신). The
  // deepest signal: shows procedure steps that never reach the gazette.
  orginl: {
    url: "/othicInfo/infoList/orginlInfoList.ajax",
    page: "https://www.open.go.kr/othicInfo/infoList/orginlInfoList.do",
    key: (r) => `${r.INSTT_CD || ""}|${r.DOC_NO || ""}|${r.PRDCTN_DT || ""}`,
  },
  // 정보목록 — registered document list (much larger, thinner per row)
  infoList: {
    url: "/othicInfo/infoList/infoList.ajax",
    page: "https://www.open.go.kr/othicInfo/infoList/infoList.do",
    key: (r) => `${r.INSTT_CD || ""}|${r.DOC_NO || ""}|${r.PRDCTN_DT || ""}`,
  },
  // 기관장결재문서 — head-of-agency approvals (small, high value)
  mnstrSan: {
    url: "/othicInfo/infoList/mnstrSanDocList.ajax",
    page: "https://www.open.go.kr/othicInfo/mnstrSanDoc/mnstrSanDocList.do",
    key: (r) => `${r.INSTT_CD || ""}|${r.DOC_NO || ""}|${r.PRDCTN_DT || ""}`,
  },
  // 사전정보 — pre-disclosed information items
  prevInfo: {
    url: "/othicInfo/prevOpenInfo/othinfBefInfList.ajax",
    page: "https://www.open.go.kr/othicInfo/prevOpenInfo/othinfBefInfList.do",
    key: (r) => `${r.INSTT_CD || ""}|${r.INFO_SJ || ""}|${r.date || r.LAST_UPDT_DT || ""}`,
  },
};

/* ── args ──────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);
const CHANNEL = arg("channel", "orginl");
const MODE = arg("mode", "daily");
const FROM = arg("from", "20260101");
const TO = arg("to", new Date().toISOString().slice(0, 10).replace(/-/g, ""));
const ROWS = Number(arg("rows", "500"));
const MAX_PAGES = Number(arg("maxPages", "80"));      // 40k rows per unit ceiling
const PAGE_DELAY = Number(arg("delay", "800"));       // ms between pages (portal throttles)
const QUERIES_FILE = arg("queries", "queries.json");
const HEADFUL = flag("headful");
const ch = CHANNELS[CHANNEL];
if (!ch) { console.error(`unknown channel: ${CHANNEL}`); process.exit(1); }

/* ── paths & state ─────────────────────────────────────────────────────── */
const stateFile = path.join(ROOT, "state", `${CHANNEL}.${MODE}.json`);
mkdirSync(path.dirname(stateFile), { recursive: true });
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : { done: {}, failed: {}, rows: 0 };
const saveState = () => writeFileSync(stateFile, JSON.stringify(state, null, 1));

const outFile = (unit) =>
  MODE === "daily"
    ? path.join(ROOT, "raw", CHANNEL, unit.slice(0, 4), `${unit}.jsonl`)
    : path.join(ROOT, "raw", `${CHANNEL}-query`, `${unit}.jsonl`);

/* ── browser session ───────────────────────────────────────────────────── */
let browser, page;
async function openSession() {
  if (browser) await browser.close().catch(() => {});
  browser = await chromium.launch({ executablePath: CHROME, headless: !HEADFUL });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });
  page = await ctx.newPage();
  await page.goto(ch.page, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
}

// One page of results, executed inside the portal's own session.
async function fetchPage({ url, kwd, startDate, endDate, viewPage, rowPage }) {
  return page.evaluate(async (p) => {
    const body = new URLSearchParams({
      kwd: p.kwd, preKwds: p.kwd, reSrchFlag: "off",
      othbcSeCd: "", insttSeCd: "", eduYn: "N",
      startDate: p.startDate, endDate: p.endDate,
      insttCdNm: "", insttCd: "", searchMainYn: "",
      viewPage: String(p.viewPage), rowPage: String(p.rowPage),
      sort: "d", url: p.url, callBackFn: "searchFn_callBack",
    });
    const r = await fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
    const text = await r.text();
    if (text.trim().startsWith("<")) return { httpError: r.status };
    const j = JSON.parse(text);
    return { code: j.code, total: Number(j.rtnTotal || 0), rows: j.rtnList || [] };
  }, { url, kwd, startDate, endDate, viewPage, rowPage });
}

// Collect one unit (a day, or a keyword span) with retry + session recovery.
async function collectUnit(unit, { kwd, startDate, endDate }) {
  const file = outFile(unit);
  mkdirSync(path.dirname(file), { recursive: true });
  const seen = new Set();
  let written = 0, total = null;

  for (let vp = 1; vp <= MAX_PAGES; vp++) {
    let res = null;
    for (let attempt = 1; attempt <= 7; attempt++) {
      try {
        res = await fetchPage({ url: ch.url, kwd, startDate, endDate, viewPage: vp, rowPage: ROWS });
        if (res.httpError) throw new Error(`HTTP ${res.httpError}`);
        if (res.code && res.code !== "200") throw new Error(`code ${res.code}`);
        break;
      } catch (e) {
        if (attempt === 7) throw e;
        // 429 = portal-side throttle: back off hard, it clears with time.
        const throttled = /429|too many/i.test(String(e));
        await new Promise((r) => setTimeout(r, throttled ? 20000 * attempt : 2500 * attempt));
        if (!throttled && attempt >= 2) await openSession();   // session likely expired
      }
    }
    if (total === null) total = res.total;
    const rows = res.rows || [];
    if (!rows.length) break;

    const fresh = [];
    for (const r of rows) {
      const k = ch.key(r);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(JSON.stringify(r));
    }
    if (fresh.length) {
      appendFileSync(file, fresh.join("\n") + "\n");
      written += fresh.length;
    }
    if (rows.length < ROWS) break;
    if (written >= total) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY));
  }
  return { written, total };
}

/* ── unit lists ────────────────────────────────────────────────────────── */
function dayList(from, to) {
  const out = [];
  const d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out.reverse();     // newest first — most useful data lands early
}
const slug = (s) => s.replace(/[^0-9A-Za-z가-힣]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

/* ── run ───────────────────────────────────────────────────────────────── */
const units = MODE === "daily"
  ? dayList(FROM, TO).map((d) => ({ id: d, kwd: "", startDate: d, endDate: d }))
  : JSON.parse(readFileSync(path.join(ROOT, QUERIES_FILE), "utf8"))
      .map((q) => ({ id: slug(q), kwd: q, startDate: FROM, endDate: TO }));

const pending = units.filter((u) => !state.done[u.id]);
console.log(`[${CHANNEL}/${MODE}] units ${units.length}, pending ${pending.length}, rows so far ${state.rows}`);

await openSession();
let n = 0, sessionAge = 0;
for (const u of pending) {
  n++;
  try {
    const { written, total } = await collectUnit(u.id, u);
    state.done[u.id] = { rows: written, total, at: new Date().toISOString().slice(0, 19) };
    state.rows += written;
    delete state.failed[u.id];
    console.log(`  ${n}/${pending.length} ${u.id}${u.kwd ? ` "${u.kwd}"` : ""} → ${written}/${total}`);
  } catch (e) {
    state.failed[u.id] = String(e).slice(0, 120);
    console.log(`  ${n}/${pending.length} ${u.id} FAILED ${String(e).slice(0, 60)}`);
    await openSession().catch(() => {});
  }
  if (n % 10 === 0) saveState();
  await new Promise((r) => setTimeout(r, PAGE_DELAY));
  if (++sessionAge >= 60) { await openSession(); sessionAge = 0; }   // refresh session
}
saveState();
await browser.close().catch(() => {});

const failed = Object.keys(state.failed).length;
console.log(`[${CHANNEL}/${MODE}] done. total rows ${state.rows}, failed units ${failed}`);
if (failed) console.log(`  failed: ${Object.keys(state.failed).slice(0, 10).join(", ")}`);
