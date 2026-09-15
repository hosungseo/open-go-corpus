// Fetch 정책실명제 project detail pages (추진실적·결재선·관련원문) for rows in realname/central.jsonl.
// Usage: node tools/collect-realname-detail.mjs --years 2025,2026 [--limit N] [--delay 400]
import fs from "node:fs";
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean));
const YEARS = String(args.years ?? "2025,2026").split(",").map(Number), LIMIT = Number(args.limit ?? 1e9), DELAY = Number(args.delay ?? 400);
const BASE = "https://www.open.go.kr/othicInfo/plcyChgrRealNm";
const OUT = "realname/detail.jsonl";
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).gclfCd) : []);
const rows = fs.readFileSync("realname/central.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => YEARS.includes(r.year) && !done.has(r.gclfCd)).slice(0, LIMIT);
let cookie = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(url) {
  for (let a = 0; a < 5; a++) {
    const res = await fetch(url, { headers: { cookie } });
    const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(",").map((c) => c.split(";")[0]).join("; ");
    if (res.status === 429) { await sleep(20000 * (a + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("gave up");
}
await req(`${BASE}/polRnInsttList.do`);
const out = fs.createWriteStream(OUT, { flags: "a" });
let i = 0;
for (const r of rows) {
  i++;
  try {
    const q = new URLSearchParams({ gclfCd: r.gclfCd, nstCd: r.nstCd, searchNstCd: r.nstCd, rgstYmd: String(r.year) });
    const html = await req(`${BASE}/polRnInsttDetail.do?${q}`);
    const m = html.match(/var\s+result\s*=\s*(\{[\s\S]*?\});\s*\n/);
    const d = m ? JSON.parse(m[1]) : {};
    const rm = d.resultMap ?? {};
    const prtn = (rm.plcPrtnInfoList ?? []).map((p) => ({ seq: p.seq, prjtPerd: p.prjtPerd, prtnInfo: p.prtnInfo, aprvInfo: p.aprvInfo }));
    const wonmun = (rm.plcWonmunList ?? []).map((w) => ({ ...Object.fromEntries(Object.entries(w).filter(([k, v]) => v !== "" && v !== 0 && v != null)) }));
    out.write(JSON.stringify({ gclfCd: r.gclfCd, year: r.year, nstNm: r.nstNm, plcNm: r.plcNm, prtn, wonmun, prtnCnt: prtn.length, wonmunCnt: wonmun.length }) + "\n");
    if (i % 25 === 0) console.error(`${i}/${rows.length} ${r.nstNm} prtn=${prtn.length} wonmun=${wonmun.length}`);
  } catch (e) { console.error(`FAIL ${r.nstNm} ${r.plcNm}: ${e.message}`); }
  await sleep(DELAY);
}
console.error(`done ${i}`);
