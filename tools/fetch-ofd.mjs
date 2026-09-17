// 열린재정(openfiscaldata.go.kr) 세출예산 세부사업을 부처·회계연도로 받는다. 키는 환경변수 OPENFISCAL_API_KEY 또는 ~/Koreabudget100/.env.
// 함정: pIndex·pSize는 문자열로 보내야 페이지가 넘어간다(숫자로 보내면 1페이지만 반복). pSize 상한 100, 한 호출 15초 → 페이지를 동시에 받는다.
import fs from "fs";
import path from "path";
import os from "os";
const KEY = process.env.OPENFISCAL_API_KEY || (() => { const m = fs.readFileSync(path.join(os.homedir(), "Koreabudget100/.env"), "utf8").match(/OPENFISCAL_API_KEY=([^\s#]+)/); return m ? m[1] : ""; })();
if (!KEY) { console.error("OPENFISCAL_API_KEY 없음"); process.exit(1); }
const [yy = "2026", offc = "행정안전부", out = ""] = process.argv.slice(2);
const page = async (p) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://www.openfiscaldata.go.kr/openApi/preview/ExpenditureBudgetAdd2", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" }, body: JSON.stringify({ Key: KEY, Type: "json", pIndex: String(p), pSize: "100", FSCL_YY: String(yy), OFFC_NM: offc }) });
      let j = await res.text(); j = JSON.parse(j); if (typeof j === "string") j = JSON.parse(j);
      const key = Object.keys(j).find((k) => Array.isArray(j[k])); const arr = key ? j[key] : [];
      const total = (arr.find((x) => x.head) || { head: [] }).head.find((h) => h.list_total_count)?.list_total_count ?? null;
      const rows = (arr.find((x) => x.row) || { row: [] }).row;
      return { total, rows };
    } catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
};
const first = await page(1);
const total = +first.total || first.rows.length; const pages = Math.ceil(total / 100);
console.error(`${offc} ${yy}: 총 ${total}행 · ${pages}페이지`);
const rows = [...first.rows];
const todo = []; for (let p = 2; p <= pages; p++) todo.push(p);
const CONC = 6; const results = {};
await Promise.all(Array.from({ length: CONC }, async (_, w) => { for (let i = w; i < todo.length; i += CONC) { results[todo[i]] = (await page(todo[i])).rows; process.stderr.write(`.`); } }));
for (let p = 2; p <= pages; p++) rows.push(...(results[p] || []));
const outPath = out || `fiscal/ofd-${offc}-${yy}.json`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(rows));
console.log(`\n${offc} ${yy}: ${rows.length}행(예상 ${total}) → ${outPath}`);
