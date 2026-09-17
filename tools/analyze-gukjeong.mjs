// 국정과제 쪽에서 정책실명제를 찾을 수 있나.
// 정책실명제 카드에는 국정과제 번호 칸이 없다. 그래서 주관부처를 다리로 삼아 본다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const G = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123.json"), "utf8"));
const rows = fs.readFileSync(R("realname/central.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const CUR = 2026;
// PDF 약칭 ↔ 포털 정식 명칭
const ALIAS = {행안부:"행정안전부",복지부:"보건복지부",국토부:"국토교통부",과기정통부:"과학기술정보통신부",기후부:"기후에너지환경부",금융위:"금융위원회",노동부:"고용노동부",국조실:"국무조정실",국방부:"국방부",산업부:"산업통상부",문체부:"문화체육관광부",외교부:"외교부",농식품부:"농림축산식품부",법무부:"법무부",교육부:"교육부",해수부:"해양수산부",성평등부:"성평등가족부",통일부:"통일부",경찰청:"경찰청",방미통위:"방송미디어통신위원회",보훈부:"국가보훈부",기획처:"기획예산처",재경부:"재정경제부",중기부:"중소벤처기업부",공정위:"공정거래위원회",감사원:"감사원",인권위:"국가인권위원회",인사처:"인사혁신처",권익위:"국민권익위원회",개인정보위:"개인정보보호위원회",행복청:"행정중심복합도시건설청",방사청:"방위사업청",동포청:"재외동포청"};
const full = (ab) => ALIAS[ab.replace(/ 등$/, "")] || ab.replace(/ 등$/, "");
const portalOrgs = new Set(rows.map((r) => r.nstNm));
const has26 = new Set(rows.filter((r) => r.year === CUR).map((r) => r.nstNm));
const g26 = {}; rows.filter((r) => r.year === CUR && /국정과제/.test(r.slctnStdr || "")).forEach((r) => { g26[r.nstNm] = (g26[r.nstNm] || 0) + 1; });
const gAll = {}; rows.filter((r) => /국정과제/.test(r.slctnStdr || "")).forEach((r) => { gAll[r.nstNm] = (gAll[r.nstNm] || 0) + 1; });

// 과제마다 상태를 매긴다
const 과제 = G.과제.map((t) => {
  const orgs = t.org.split("·").map(full);
  const 포털없음 = orgs.every((o) => !portalOrgs.has(o));
  const 등록 = orgs.reduce((s, o) => s + (g26[o] || 0), 0);
  const 상태 = 포털없음 ? "포털에 없음" : 등록 > 0 ? "2026 등록" : has26.size && orgs.some((o) => has26.has(o)) ? "2026 등록·국정과제 표시 없음" : "2026 미등록";
  return { n: t.n, nm: t.nm, org: t.org, orgFull: orgs, goal: t.goal, goalNm: t.goalNm, 상태, 등록건수: 등록, 누적국정과제사업: orgs.reduce((s, o) => s + (gAll[o] || 0), 0) };
});
const cnt = {}; 과제.forEach((t) => { cnt[t.상태] = (cnt[t.상태] || 0) + 1; });

// 주관부처별
const lead = {}; 과제.forEach((t) => t.org.split("·").forEach((o) => { const k = o.replace(/ 등$/, ""); lead[k] = (lead[k] || 0) + 1; }));
const 주관부처 = Object.entries(lead).map(([ab, n]) => { const f = full(ab); return { ab, full: f, 국정과제: n, 포털: portalOrgs.has(f), 등록2026: has26.has(f), 국정과제표시2026: g26[f] || 0, 국정과제표시누적: gAll[f] || 0 }; }).sort((a, b) => b.국정과제 - a.국정과제);

// 번호를 어딘가 적은 건 — 정부별 체계
const numbered = rows.filter((r) => /국정과제\s*\d{1,3}/.test((r.slctnStdr || "") + (r.prjtSmry || "") + (r.prtnCtt || "")));
const 체계 = { "100대 (2017~2022, 'N-M' 꼴)": 0, "120대 (2022~2025)": 0, "123대 (2025~)": 0 };
numbered.forEach((r) => { const k = r.year <= 2022 ? "100대 (2017~2022, 'N-M' 꼴)" : r.year <= 2025 ? "120대 (2022~2025)" : "123대 (2025~)"; 체계[k]++; });
const 세부꼴 = numbered.filter((r) => /국정과제\s*\d{1,3}-\d/.test((r.slctnStdr || "") + (r.prjtSmry || "") + (r.prtnCtt || ""))).length;

const out = {
  작성일: new Date().toISOString().slice(0, 10), 기준연도: CUR,
  원천: "정부업무평가포털 「123대 국정과제」 PDF · 정보공개포털 정책실명제 중앙행정기관 전수 6,847건",
  전체: rows.length, 국정과제표시: rows.filter((r) => /국정과제/.test(r.slctnStdr || "")).length,
  번호기재: { 건수: numbered.length, 체계, 세부번호꼴: 세부꼴 },
  포털기관수: portalOrgs.size, 올해등록기관: has26.size,
  상태별: cnt, 과제, 주관부처,
};
fs.writeFileSync(R("notes/gukjeong.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`국정과제 ${과제.length} · 상태별:`, Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(`주관부처 ${주관부처.length}곳 · 포털에 없음 ${주관부처.filter((o) => !o.포털).length} · 2026 등록 ${주관부처.filter((o) => o.등록2026).length}`);
console.log(`번호 기재 ${numbered.length}건:`, Object.entries(체계).map(([k, v]) => `${k} ${v}`).join(" · "), `· 세부번호꼴 ${세부꼴}`);
