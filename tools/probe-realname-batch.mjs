// Batch probe: for each 정책실명제 project (2025–2026), search the portal's
// 사전정보공표 (all institutions) and 원문공개 (same institution, 2025-01-01~today)
// with one keyword derived from the project name. Resumable; appends to
// realname/probe-batch.jsonl. Needs a browser session (playwright-core + Chrome).
//   node tools/probe-realname-batch.mjs [--years 2025,2026] [--delay 1200] [--limit N]
import { chromium } from "playwright-core";
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean));
const YEARS = String(args.years ?? "2025,2026").split(",").map(Number);
const DELAY = Number(args.delay ?? 1200), LIMIT = Number(args.limit ?? 1e9);
const OUT = "realname/probe-batch.jsonl";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const today = new Date().toISOString().slice(0, 10);

const STOP = new Set(["사업","추진","구축","운영","지원","강화","확대","계획","및","등","위한","통한","관리","개선","활성화","체계","조성","제도","정책","시행","마련","대한","종합","기반","국가","국민","지역","방안","도입","정비","신규","연구","용역","개발","실시","향상","제고","증진","확산","고도화","혁신"]);
const SUFFIX = /(사업|운영|구축|지원|강화|확대|추진|체계|조성|개선|활성화|계획|방안|도입|정비|관리|제도|고도화)+$/;
export function keyword(name) {
  let s = String(name || "").replace(/&#\d+;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ").replace(/？/g, " ").replace(/[’'`‘]\s*\d{2}\.?\s*\d*월?/g, " ");
  const toks = s.split(/[\s「」『』()（）\[\]·ㆍ,.\-~:/&|'"‘’“”<>]+/).filter(Boolean);
  const cands = [];
  for (const t of toks) {
    if (/^\d/.test(t)) continue;
    let u = t;
    if (u.length > 2) u = u.replace(/(으로|의|을|를|과|와|에|로|은|는|이|가)$/, "");
    while (u.length > 2) { const v = u.replace(SUFFIX, ""); if (v === u || v.length < 2) break; u = v; }
    if (u.length >= 2 && !STOP.has(u) && /[가-힣A-Za-z]/.test(u)) cands.push(u);
  }
  cands.sort((a, b) => b.length - a.length); // longest first, stable → earlier token wins ties
  return cands[0] || toks.find((t) => t.length >= 2) || String(name).slice(0, 4);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).gclfCd) : []);
  const rows = fs.readFileSync("realname/central.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => YEARS.includes(r.year) && !done.has(r.gclfCd)).slice(0, LIMIT);
  console.error(`pending ${rows.length} (done ${done.size})`);
  let browser, page;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function open() {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    page = await (await browser.newContext({ locale: "ko-KR" })).newPage();
    await page.goto("https://www.open.go.kr/othicInfo/prevOpenInfo/othinfBefInfList.do", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
  }
  async function search(kind, kwd, nstCd, nstNm) {
    return page.evaluate(async ({ kind, kwd, nstCd, nstNm, today }) => {
      const url = kind === "prev" ? "/othicInfo/prevOpenInfo/othinfBefInfList.ajax" : "/othicInfo/infoList/orginlInfoList.ajax";
      const body = kind === "prev"
        ? new URLSearchParams({ kwd, preKwds: kwd, reSrchFlag: "off", insttSeCd: "", eduYn: "N", startDate: "2014-01-01", endDate: today, insttCd: "", insttCdNm: "", searchMainYn: "", viewPage: "1", rowPage: "10", sort: "s", url, callBackFn: "searchFn_callBack" })
        : new URLSearchParams({ kwd, preKwds: kwd, reSrchFlag: "off", othbcSeCd: "", insttSeCd: "", eduYn: "N", startDate: "20250101", endDate: today.replace(/-/g, ""), insttCdNm: nstNm, insttCd: nstCd, searchMainYn: "", viewPage: "1", rowPage: "10", sort: "d", url, callBackFn: "searchFn_callBack" });
      const x = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" }, body });
      const t = await x.text();
      if (t.trim().startsWith("<")) return { err: x.status };
      const j = JSON.parse(t);
      const root = j.result ?? j;
      const L = root.rtnList ?? [];
      const total = Number(root.rtnTotal ?? root.total ?? root.totalCount ?? j.rtnTotal ?? L.length);
      const code = j.code ?? root.code;
      if (code && String(code) !== "200") return { err: `code ${code}` };
      const items = kind === "prev"
        ? L.slice(0, 5).map((d) => ({ inst: d.INSTT_NM, dept: d.DEPT_NM, title: d.BEFFAT_PUBLICT_INFO_SJ, detail: (d.BEFFAT_PUBLICT_INFO_CN || "").slice(0, 80), url: d.INFO_LC_URL, inq: d.INQIRE_CNT, no: d.BEFFAT_PUBLICT_INFO_NO }))
        : L.slice(0, 5).map((d) => ({ date: (d.PRDCTN_DT || "").slice(0, 8), inst: d.PROC_INSTT_NM, dept: d.CHRG_DEPT_NM, title: d.INFO_SJ, id: d.PRDCTN_INSTT_REGIST_NO }));
      return { total, items };
    }, { kind, kwd, nstCd, nstNm, today });
  }
  await open();
  const out = fs.createWriteStream(OUT, { flags: "a" });
  let i = 0, fails = 0;
  for (const r of rows) {
    i++;
    const kwd = keyword(r.plcNm);
    const rec = { gclfCd: r.gclfCd, year: r.year, nstCd: r.nstCd, nstNm: r.nstNm, plcNm: r.plcNm, kwd, at: today };
    for (const kind of ["prev", "orginl"]) {
      let res = null;
      for (let a = 0; a < 4; a++) {
        try {
          res = await search(kind, kwd, r.nstCd, r.nstNm);
          if (res.err && String(res.err).includes("429")) { await sleep(20000 * (a + 1)); continue; }
          if (res.err && a < 2) { await open(); continue; }
          break;
        } catch (e) { res = { err: e.message }; await open(); }
      }
      rec[kind] = res;
      await sleep(DELAY);
    }
    if (rec.prev?.err || rec.orginl?.err) fails++;
    out.write(JSON.stringify(rec) + "\n");
    if (i % 20 === 0 || i === rows.length) console.error(`${i}/${rows.length} ${r.nstNm} "${kwd}" prev=${rec.prev?.total ?? rec.prev?.err} orginl=${rec.orginl?.total ?? rec.orginl?.err} fails=${fails}`);
  }
  await browser.close();
  console.error(`done ${i}, fails ${fails}`);
}
