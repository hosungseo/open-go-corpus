// 세부과제 제목 정제 — PDF 추출 때 생긴 두 가지 흠: (1) 첫 글자가 떨어짐("노 근리", "지 방의회법") (2) 가운뎃점 앞 공백("책임성 ·전문성").
// (1)은 같은 제목 뒤에 붙은 꼴이 다시 나올 때만 자동으로 붙이고("노근리"), 나머지는 눈으로 정한 목록(JOIN)만 붙인다. "군 사법개혁"·"본 제도 시행"처럼 진짜 한 글자 낱말은 둔다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const P = path.join(ROOT, "lawhist/gukjeong-123-sub.json");
const JOIN = new Set(["20-2","25-3","40-3","41-4","52-2","61-2","85-4","94-3","96-1","99-4","106-1","117-1"]);   // 눈으로 확인한 것: 초지능·사전예방·이행기반·산업부문·자치입법권·금융비용·지역사회·산업별·고용서비스·글로벌·전국민·사회적
const d = JSON.parse(fs.readFileSync(P, "utf8"));
let joined = 0, dots = 0;
for (const t of d.과제) for (const s of t.세부) {
  let x = s.제목;
  const m = x.match(/^([가-힣])\s([가-힣]{2,})/);
  if (m && (JOIN.has(s.no) || x.slice(m[0].length).includes(m[1] + m[2][0]))) { x = m[1] + x.slice(2); joined++; }
  const y = x.replace(/(\S) ·(\S)/g, "$1·$2"); if (y !== x) dots++; x = y;
  s.제목 = x;
}
fs.writeFileSync(P, JSON.stringify(d, null, 1) + "\n");
console.log(`제목 정제: 첫 글자 붙임 ${joined} · 가운뎃점 앞 공백 ${dots}`);
