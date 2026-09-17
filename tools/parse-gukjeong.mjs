// 「123대 국정과제」 PDF 텍스트에서 번호·과제명·주관부처·국정목표·전략을 뽑는다.
// 목록표 구간의 행 꼴: "[국정52]   주민 삶의 질 향상을 위한 자치분권 역량 제고   행안부"
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const txt = fs.readFileSync(R("lawhist/gukjeong-123.txt"), "utf8").split("\n");
const tasks = [];
let goal = null, strategy = null;
for (const raw of txt) {
  const l = raw.trim();
  let m;
  if ((m = l.match(/^국정목표\s*(\d)\s*[.:|]?\s*(.+)$/)) && l.length < 60) { goal = { n: +m[1], nm: m[2].trim() }; continue; }
  if ((m = l.match(/^▪?\s*전략\s*(\d+)\s*[:：]\s*(.+)$/))) { strategy = { n: +m[1], nm: m[2].trim() }; continue; }
  if ((m = l.match(/\[국정(\d{1,3})\]\s+(.+?)\s{2,}(\S+(?: 등)?)\s*$/))) {   // 왼쪽 여백에 국정목표 이름이 붙기도 한다
    const n = +m[1];
    if (tasks.some((t) => t.n === n)) continue;
    tasks.push({ n, nm: m[2].trim(), org: m[3].trim(), goal: goal ? goal.n : null, goalNm: goal ? goal.nm : null, strategy: strategy ? strategy.nm : null });
  }
}
tasks.sort((a, b) => a.n - b.n);
const GOALS = [[1,19,"국민이 하나되는 정치"],[20,48,"세계를 이끄는 혁신경제"],[49,71,"모두가 잘사는 균형성장"],[72,108,"기본이 튼튼한 사회"],[109,123,"국익 중심의 외교안보"]];
for (const t of tasks) { const g = GOALS.findIndex(([a,b]) => t.n >= a && t.n <= b); t.goal = g + 1; t.goalNm = GOALS[g][2]; }
const missing = []; for (let i = 1; i <= 123; i++) if (!tasks.some((t) => t.n === i)) missing.push(i);
const out = { 출처: "정부업무평가포털 「이재명정부 123대 국정과제」 PDF (2026-03-24 게시)", 추출일: new Date().toISOString().slice(0,10), 과제수: tasks.length, 빠짐: missing, 과제: tasks };
fs.writeFileSync(R("lawhist/gukjeong-123.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`과제 ${tasks.length}/123 · 빠짐 ${missing.length ? missing.join(",") : "없음"}`);
const orgs = {}; tasks.forEach((t) => t.org.split("·").forEach((o) => { orgs[o] = (orgs[o] || 0) + 1; }));
console.log(`주관부처 ${Object.keys(orgs).length}곳:`, Object.entries(orgs).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(" · "));
const goals = {}; tasks.forEach((t) => { goals[t.goal] = (goals[t.goal] || 0) + 1; });
console.log("국정목표별:", Object.entries(goals).map(([k,v])=>`${k}:${v}`).join(" "));
console.log("표본:", tasks.filter((t) => [14,52,72,73,76].includes(t.n)).map((t) => `${t.n} ${t.nm} (${t.org}) [목표${t.goal}]`).join("\n      "));
