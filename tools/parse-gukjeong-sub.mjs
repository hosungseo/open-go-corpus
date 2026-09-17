// 123대 국정과제 PDF의 과제별 「주요내용」 불릿을 뽑는다.
// 번호는 안 적혀 있지만 부처는 순서로 "56-3"처럼 부른다. 그 순서를 세부과제 번호로 둔다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const txt = fs.readFileSync(R("lawhist/gukjeong-123.txt"), "utf8");
const G = JSON.parse(fs.readFileSync(R("lawhist/gukjeong-123.json"), "utf8")).과제;

// 과제 상세 쪽: "  56   북극항로 시대를 …" 로 시작해 다음 과제 머리까지
// 과제 상세 쪽 머리: "  56   제목" 줄 뒤에 "◉ 과제목표"가 따라온다. 제목 글자에 기대지 않고 번호+목표 표식으로 잡는다.
const heads = [];
const re = /^\s{2,}(\d{1,3})\s{2,}\S[^\n]*\n(?:[^\n]*\n){0,6}?\s*◉ 과제목표/gm;
let mm; const seen = new Set();
while ((mm = re.exec(txt))) { const n = +mm[1]; if (n >= 1 && n <= 123 && !seen.has(n)) { seen.add(n); heads.push({ n, at: mm.index }); } }
heads.sort((a, b) => a.at - b.at);
const out = [];
for (let i = 0; i < heads.length; i++) {
  const seg = txt.slice(heads[i].at, i + 1 < heads.length ? heads[i + 1].at : heads[i].at + 12000);
  const j = seg.indexOf("◉ 주요내용"); if (j < 0) { out.push({ n: heads[i].n, 세부: [] }); continue; }
  let body = seg.slice(j + 6);
  const k = body.search(/◉|\n\s*\d{1,3}\s{2,}[가-힣]/); if (k > 0) body = body.slice(0, k);
  // 최상위 불릿 "•" 로 시작하는 줄이 세부과제. 들여쓰기가 더 깊은 "-"는 그 아래 조치.
  const items = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s{0,12}•\s*(.+)$/);
    if (m) items.push(m[1].replace(/[\x00-\x1f\x7f]/g, "").trim().replace(/\s+/g, " "));   // pdftotext가 불릿 자리에 제어문자를 남긴다
  }
  out.push({ n: heads[i].n, 세부: items.map((s, idx) => ({ no: `${heads[i].n}-${idx + 1}`, 제목: s.slice(0, 80) })) });
}
const total = out.reduce((s, o) => s + o.세부.length, 0);
fs.writeFileSync(R("lawhist/gukjeong-123-sub.json"), JSON.stringify({ 출처: "123대 국정과제 PDF 「주요내용」 불릿, 순서를 번호로", 과제수: out.length, 세부과제수: total, 과제: out }, null, 2) + "\n");
const zero = out.filter((o) => !o.세부.length).map((o) => o.n);
console.log(`과제 ${out.length}/123 · 세부과제(주요내용 불릿) ${total}개 · 과제당 평균 ${(total / out.length).toFixed(1)} · 불릿 0개인 과제 ${zero.length}: ${zero.slice(0, 12).join(",")}`);
for (const n of [44, 52, 56, 71, 54]) { const o = out.find((x) => x.n === n); console.log(`\n[${n}] ${o ? o.세부.length : "?"}개`); (o ? o.세부 : []).forEach((s) => console.log(`  ${s.no}  ${s.제목.slice(0, 60)}`)); }
