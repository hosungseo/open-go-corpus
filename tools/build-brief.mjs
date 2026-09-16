// 설명자료를 저장소 밖으로 만든다. 공개 사이트(docs/)에는 넣지 않는다.
// 사용: node tools/build-brief.mjs   (brief/brief.src.html → brief/brief.html)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);

const SRC = R("brief/brief.src.html");
const CSS = R("docs/src/shared.css");
const MARKS = R("brief/shots/marks.json");
for (const [f, hint] of [[SRC, "설명자료 원본"], [CSS, "공통 CSS"], [MARKS, "주석 좌표 (tools/capture-shots.mjs 먼저 실행)"]]) {
  if (!fs.existsSync(f)) { console.error(`ERROR ${hint} 없음: ${path.relative(ROOT, f)}`); process.exit(1); }
}
let page = fs.readFileSync(SRC, "utf8");
const linkRe = /<link\s+rel="stylesheet"\s+href="shared\.css"\s*\/?>/;
if (!linkRe.test(page)) { console.error("ERROR brief.src.html에 shared.css 링크가 없음"); process.exit(1); }
page = page.replace(linkRe, () => `<style>\n${fs.readFileSync(CSS, "utf8")}\n</style>`);
const marks = fs.readFileSync(MARKS, "utf8").replace(/<\//g, "<\\/");
page = page.replace("/*__MARKS__*/null", () => marks).replace("/*__MARKS__*/", () => marks);
if (/<link\s+rel="stylesheet"\s+href="(?!https?:)/.test(page)) { console.error("ERROR 인라인 후에도 로컬 스타일시트 참조가 남음"); process.exit(1); }
fs.writeFileSync(R("brief/brief.html"), page);
console.error(`brief/brief.html 생성 (${(page.length / 1024).toFixed(0)}KB)`);
