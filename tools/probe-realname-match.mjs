// Feasibility probe: can 정책실명제 projects be auto-linked to 원문공개 documents?
// For sampled projects, search 원문 by 2 keywords from the project name, filtered to the institution.
import { chromium } from "playwright-core";
import fs from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const STOP = new Set(["사업","추진","구축","운영","지원","강화","확대","계획","및","등","위한","통한","관리","개선","활성화","체계","조성","제도","정책","시행","마련","대한"]);
const rows = fs.readFileSync("realname/central.jsonl","utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
const pick = [];
for (const [nst, y, n] of [["행정안전부",2025,6],["국가데이터처",2025,4],["관세청",2026,4],["해양수산부",2026,4],["국세청",2025,4]]) {
  pick.push(...rows.filter(r=>r.nstNm===nst && r.year===y).slice(0,n));
}
const kw = (s) => s.replace(/[’'`]\d{2}년?/g," ").replace(/[「」『』()（）\[\]·ㆍ？?,.\-~:/]/g," ").split(/\s+/).filter(t=>t.length>=2 && !STOP.has(t) && !/^\d/.test(t)).slice(0,2).join(" ");
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ locale:"ko-KR" })).newPage();
await page.goto("https://www.open.go.kr/othicInfo/infoList/orginlInfoList.do", { waitUntil:"domcontentloaded", timeout:60000 });
await page.waitForTimeout(1500);
const out = [];
for (const r of pick) {
  const k = kw(r.plcNm);
  const res = await page.evaluate(async (p) => {
    const body = new URLSearchParams({ kwd:p.kwd, preKwds:p.kwd, reSrchFlag:"off", othbcSeCd:"", insttSeCd:"", eduYn:"N", startDate:p.s, endDate:p.e, insttCdNm:p.nm, insttCd:p.cd, searchMainYn:"", viewPage:"1", rowPage:"20", sort:"d", url:"/othicInfo/infoList/orginlInfoList.ajax", callBackFn:"searchFn_callBack" });
    const x = await fetch("/othicInfo/infoList/orginlInfoList.ajax",{ method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"}, body });
    const t = await x.text(); if (t.trim().startsWith("<")) return { err:x.status };
    const j = JSON.parse(t); return { code:j.code, total:Number(j.rtnTotal||0), titles:(j.rtnList||[]).slice(0,5).map(d=>d.PRDCTN_DT.slice(0,8)+" "+d.INFO_SJ) };
  }, { kwd:k, s:`${r.year}0101`, e:`${r.year}1231`, cd:r.nstCd, nm:r.nstNm });
  out.push({ year:r.year, nst:r.nstNm, plcNm:r.plcNm, kwd:k, ...res });
  console.log(`${r.year} ${r.nstNm} | ${r.plcNm.slice(0,40)} | kw="${k}" → ${res.total ?? res.err}`);
  for (const t of (res.titles||[]).slice(0,3)) console.log(`     · ${t.slice(0,90)}`);
  await page.waitForTimeout(1200);
}
fs.writeFileSync("realname/probe-match.json", JSON.stringify(out,null,1));
await browser.close();
