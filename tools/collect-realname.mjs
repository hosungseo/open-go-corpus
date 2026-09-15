// Collect 정책실명제 중점관리 대상사업 (central agencies) from open.go.kr.
// No browser session needed: the institution list is a plain AJAX POST and
// the per-institution list page embeds the project array as JSON.
// Usage: node tools/collect-realname.mjs [--from 2018] [--to 2026] [--delay 500]
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean));
const FROM = Number(args.from ?? 2018), TO = Number(args.to ?? 2026), DELAY = Number(args.delay ?? 500);
const BASE = "https://www.open.go.kr/othicInfo/plcyChgrRealNm";
const OUT = path.resolve("realname");
fs.mkdirSync(OUT, { recursive: true });

let cookie = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(url, opt = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { ...opt, headers: { ...(opt.headers ?? {}), cookie } });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(",").map((c) => c.split(";")[0]).join("; ");
    if (res.status === 429) { await sleep(20000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  }
  throw new Error(`gave up ${url}`);
}

await req(`${BASE}/polRnInsttList.do`); // establish session cookie
const all = [];
for (let y = FROM; y <= TO; y++) {
  const body = new URLSearchParams({ insttSeCd: "C", rgstYmd: String(y) });
  const j = JSON.parse(await req(`${BASE}/polRnInsttList.ajax`, { method: "POST", body, headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded" } }));
  const insts = j.modelAndView.model.result.policyRealNameList ?? [];
  console.error(`[${y}] institutions ${insts.length}`);
  for (const inst of insts) {
    const q = new URLSearchParams({ nstCd: inst.nstCd, nstNm: inst.nstNm, searchNstCd: inst.nstCd, searchNstNm: inst.nstNm, rgstYmd: String(y) });
    const html = await req(`${BASE}/polRnBList.do?${q}`);
    const m = html.match(/var\s+result\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!m) { console.error(`  !! no json ${y} ${inst.nstNm}`); continue; }
    const list = JSON.parse(m[1]).govmPolicyRealNameList ?? [];
    const rows = list.map((r) => ({
      year: y, nstCd: r.nstCd, nstNm: r.nstNm, gclfCd: r.gclfCd, plcNm: r.plcNm, chgrDeptNm: r.chgrDeptNm, chgrNm: r.chgrNm,
      prjtPerd: r.prjtPerd, prjtStrtDt: r.prjtStrtDt, prjtEndDt: r.prjtEndDt, prjtSmry: r.prjtSmry, prtnCtt: r.prtnCtt,
      slctnStdr: r.slctnStdr, statusCd: r.statusCd, typeCd: r.typeCd, inqCnt: r.inqCnt, frstRgstPot: r.frstRgstPot, lastUpdtPot: r.lastUpdtPot,
    }));
    all.push(...rows);
    console.error(`  ${inst.nstNm} ${rows.length}/${inst.plcyCnt}`);
    await sleep(DELAY);
  }
}
fs.writeFileSync(path.join(OUT, "central.jsonl"), all.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.error(`done. rows ${all.length} → realname/central.jsonl`);
