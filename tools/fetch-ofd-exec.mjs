// 열린재정 월별 지출집행상황(VWFOEM) — 단위사업별 예산현액·누계집행액. 소관코드 필수(행정안전부 101). 가장 최근 달부터 거슬러 데이터 있는 달을 찾는다.
import fs from "fs";
import path from "path";
import os from "os";
const KEY = process.env.OPENFISCAL_API_KEY || (() => { const m = fs.readFileSync(path.join(os.homedir(), "Koreabudget100/.env"), "utf8").match(/OPENFISCAL_API_KEY=([^\s#]+)/); return m ? m[1] : ""; })();
const [yy = "2026", offcCd = "101", offcNm = "행정안전부", out = ""] = process.argv.slice(2);
const call = async (m, p) => {
  const u = `https://openapi.openfiscaldata.go.kr/VWFOEM?Key=${KEY}&Type=json&pIndex=${p}&pSize=1000&FSCL_YY=${yy}&EXE_M=${m}&OFFC_CD=${offcCd}`;
  let j = JSON.parse(await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).text()); if (typeof j === "string") j = JSON.parse(j);   // 응답이 문자열로 한 번 더 감싸여 온다
  if (j.RESULT) return { rows: [], total: 0, msg: j.RESULT.CODE };
  const key = Object.keys(j).find((k) => Array.isArray(j[k])); const arr = j[key];
  const total = (arr.find((x) => x.head) || { head: [] }).head.find((h) => h.list_total_count)?.list_total_count ?? 0;
  return { rows: (arr.find((x) => x.row) || { row: [] }).row, total };
};
let month = null, rows = [];
for (let m = 12; m >= 1; m--) { const r = await call(m, 1); if (r.rows.length) { month = m; rows = r.rows; const pages = Math.ceil(r.total / 1000); for (let p = 2; p <= pages; p++) rows.push(...(await call(m, p)).rows); break; } }
if (!month) { console.error("데이터 없음"); process.exit(1); }
const by = {};
for (const r of rows) { const k = r.ACTV_NM; const o = by[k] || { 단위사업: k, 프로그램: r.PGM_NM, 회계: r.FSCL_NM, 예산현액: 0, 누계집행: 0, 당월집행: 0 }; o.예산현액 += +r.ANEXP_BDG_CAMT || 0; o.누계집행 += +r.THISM_AGGR_EP_AMT || 0; o.당월집행 += +r.EP_AMT || 0; by[k] = o; }
for (const o of Object.values(by)) { o.집행률 = o.예산현액 ? Math.round(o.누계집행 / o.예산현액 * 1000) / 10 : null; o.예산현액억 = Math.round(o.예산현액 / 1e8 * 10) / 10; o.누계집행억 = Math.round(o.누계집행 / 1e8 * 10) / 10; }   // 원 단위 → 억
const outPath = out || `fiscal/ofd-${offcNm}-${yy}-exec.json`;
fs.writeFileSync(outPath, JSON.stringify({ 출처: `열린재정 VWFOEM 월별 지출집행상황 · FSCL_YY ${yy} · EXE_M ${month} · OFFC_CD ${offcCd} ${offcNm} · ${new Date().toISOString().slice(0, 10)} 수집 · 단위사업별 합산`, 집행월: month, 행수: rows.length, 단위사업수: Object.keys(by).length, 단위사업: by }, null, 1) + "\n");
const sample = rows[0]; console.log(`${offcNm} ${yy}년 ${month}월: ${rows.length}행 · 단위사업 ${Object.keys(by).length}개 → ${outPath}`); console.log("샘플:", JSON.stringify({ ACTV_NM: sample.ACTV_NM, ANEXP_BDG_CAMT: sample.ANEXP_BDG_CAMT, EP_AMT: sample.EP_AMT, THISM_AGGR_EP_AMT: sample.THISM_AGGR_EP_AMT }));
const tot = Object.values(by).reduce((a, o) => ({ b: a.b + o.예산현액, e: a.e + o.누계집행 }), { b: 0, e: 0 }); console.log("합계 예산현액", tot.b.toLocaleString(), "누계집행", tot.e.toLocaleString(), "집행률", (tot.e / tot.b * 100).toFixed(1) + "%");
