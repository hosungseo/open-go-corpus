// 글자 크기 자를 하나로 맞춘다.
// 필요할 때마다 값을 만들어 붙이면 종류만 늘고 위계는 오히려 흐려진다.
// CSS는 11단, 그림(SVG) 안 라벨은 4단으로 못 박는다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = path.join(ROOT, "docs/src");

export const CSS_SCALE = [12, 13, 14, 15, 17, 19, 22, 27, 32, 40, 60];
export const SVG_SCALE = [11.5, 12.5, 14, 15];

// 가까운 쪽이 아니라 정해 둔 쪽으로 붙인다. 본문·표제 기본값은 그대로 두는 배치다.
const CSS_MAP = {
  9: 12, 10: 12, 11: 12, 11.5: 12, 12: 12,
  12.5: 13, 13: 13, 13.5: 13,
  14: 14, 14.5: 14,
  15: 15, 15.5: 15,
  16: 17, 16.5: 17, 17: 17,
  18: 19, 19: 19, 20: 19,
  21: 22, 22: 22, 24: 22,
  26: 27, 27: 27, 28: 27,
  30: 32, 32: 32, 34: 32,
  40: 40, 44: 40,
  60: 60,
};
const SVG_MAP = {
  9: 11.5, 10: 11.5, 10.5: 11.5, 11: 11.5, 11.5: 11.5,
  12: 12.5, 12.5: 12.5, 13: 12.5,
  13.5: 14, 14: 14, 14.5: 14,
  15: 15,
};

const num = (s) => Number(s);
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n));

export function normalizeText(text, file) {
  const unmapped = [];
  let css = 0, svg = 0;
  // CSS 선언과 인라인 스타일
  text = text.replace(/font-size:\s*([0-9.]+)px/g, (m, v) => {
    const to = CSS_MAP[num(v)];
    if (to === undefined) { unmapped.push(`${file} css ${v}px`); return m; }
    if (to !== num(v)) css++;
    return `font-size:${fmt(to)}px`;
  });
  // SVG 속성
  text = text.replace(/font-size="([0-9.]+)"/g, (m, v) => {
    const to = SVG_MAP[num(v)];
    if (to === undefined) { unmapped.push(`${file} svg ${v}`); return m; }
    if (to !== num(v)) svg++;
    return `font-size="${fmt(to)}"`;
  });
  return { text, css, svg, unmapped };
}

// 자 밖의 값이 다시 생기지 않는지 본다. 빌드에서 부른다.
export function auditText(text) {
  const bad = [];
  for (const m of text.matchAll(/font-size:\s*([0-9.]+)px/g))
    if (!CSS_SCALE.includes(num(m[1]))) bad.push(`css ${m[1]}px`);
  for (const m of text.matchAll(/font-size="([0-9.]+)"/g))
    if (!SVG_SCALE.includes(num(m[1]))) bad.push(`svg ${m[1]}`);
  return bad;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const files = fs.readdirSync(SRC).filter((f) => /\.(html|css)$/.test(f));
  let tc = 0, ts = 0;
  const un = [];
  for (const f of files) {
    const p = path.join(SRC, f);
    const r = normalizeText(fs.readFileSync(p, "utf8"), f);
    if (r.css || r.svg) fs.writeFileSync(p, r.text);
    if (r.css || r.svg) console.log(`${f.padEnd(14)} css ${String(r.css).padStart(3)}곳 · svg ${String(r.svg).padStart(3)}곳`);
    tc += r.css; ts += r.svg; un.push(...r.unmapped);
  }
  console.log(`\n바꾼 곳 css ${tc} · svg ${ts}`);
  if (un.length) { console.log("자에 없는 값:"); un.forEach((x) => console.log("  " + x)); }
  const left = new Set(), leftS = new Set();
  for (const f of files) {
    const t = fs.readFileSync(path.join(SRC, f), "utf8");
    for (const m of t.matchAll(/font-size:\s*([0-9.]+)px/g)) left.add(num(m[1]));
    for (const m of t.matchAll(/font-size="([0-9.]+)"/g)) leftS.add(num(m[1]));
  }
  console.log(`남은 css 단계 ${left.size}종: ${[...left].sort((a,b)=>a-b).join(" ")}`);
  console.log(`남은 svg 단계 ${leftS.size}종: ${[...leftS].sort((a,b)=>a-b).join(" ")}`);
}
