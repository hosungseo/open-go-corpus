// 법제처 DRF에서 세 제도 근거 법령의 시행본 전수를 받아 조문 단위로 정규화한다.
// 사용: node tools/collect-law-history.mjs [--force]
// 출력: lawhist/raw/<mst>-<efYd>.xml (원본), lawhist/versions.json, lawhist/articles.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OC = (() => {
  const p = path.join(process.env.HOME, ".openclaw/secrets/law-go-kr-oc");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  if (process.env.LAW_GO_KR_OC) return process.env.LAW_GO_KR_OC.trim();
  throw new Error("law.go.kr OC를 찾을 수 없습니다");
})();

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RAW = path.join(ROOT, "lawhist/raw");
fs.mkdirSync(RAW, { recursive: true });

// 추적 대상 — 법령ID(LID)는 개명·전부개정을 관통한다.
const LAWS = [
  { key: "act", lid: "001357", label: "공공기관의 정보공개에 관한 법률", rank: "법률" },
  { key: "decree", lid: "002255", label: "공공기관의 정보공개에 관한 법률 시행령", rank: "대통령령" },
  { key: "rule", lid: "003728", label: "행정업무의 운영 및 혁신에 관한 규정", rank: "대통령령" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "open-go-corpus/law-history" } });
      const text = await res.text();
      if (text.startsWith("<?xml")) return text;
      if (i === tries - 1) throw new Error("XML이 아닌 응답: " + text.slice(0, 120));
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await sleep(1200 * (i + 1));
  }
  return "";
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1].trim() : "";
};

async function versionList(lid) {
  const xml = await get(
    `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=eflaw&type=XML&LID=${lid}&display=100`
  );
  const rows = [...xml.matchAll(/<law id=[\s\S]*?<\/law>/g)].map((m) => {
    const b = m[0];
    return {
      name: tag(b, "법령명한글"),
      lid: tag(b, "법령ID"),
      mst: tag(b, "법령일련번호"),
      efYd: tag(b, "시행일자"),
      promulgated: tag(b, "공포일자"),
      no: tag(b, "공포번호"),
      kind: tag(b, "제개정구분명"),
      status: tag(b, "현행연혁코드"),
    };
  });
  return rows.filter((r) => r.lid === lid).sort((a, b) => a.efYd.localeCompare(b.efYd));
}

function parseArticles(xml) {
  return [...xml.matchAll(/<조문단위[\s\S]*?<\/조문단위>/g)]
    .map((m) => {
      const b = m[0];
      const body = tag(b, "조문내용");
      // 항·호·목까지 모두 모은다. 호를 빠뜨리면 개정 여부 판정에 잡음이 생긴다.
      const paras = [...b.matchAll(/<(?:항내용|호내용|목내용)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:항내용|호내용|목내용)>/g)].map(
        (x) => x[1].trim()
      );
      return {
        no: tag(b, "조문번호"),
        branch: tag(b, "조문가지번호"),
        title: tag(b, "조문제목"),
        kind: tag(b, "조문여부"),
        efYd: tag(b, "조문시행일자"),
        text: [body, ...paras].filter(Boolean).join("\n"),
      };
    })
    .filter((a) => a.no);
}

const force = process.argv.includes("--force");
const versions = [];
const articles = {};

for (const law of LAWS) {
  const list = await versionList(law.lid);
  console.error(`${law.label}: 시행본 ${list.length}개`);
  const seen = new Set();
  for (const v of list) {
    const id = `${law.key}-${v.mst}-${v.efYd}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const file = path.join(RAW, `${id}.xml`);
    let xml;
    if (!force && fs.existsSync(file)) {
      xml = fs.readFileSync(file, "utf8");
    } else {
      xml = await get(
        `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=eflaw&type=XML&MST=${v.mst}&efYd=${v.efYd}`
      );
      fs.writeFileSync(file, xml);
      await sleep(400);
    }
    const arts = parseArticles(xml);
    versions.push({ ...v, lawKey: law.key, rank: law.rank, id, articleCount: arts.length });
    articles[id] = arts;
    console.error(`  ${v.efYd} ${v.kind} 조문 ${arts.length}`);
  }
}

fs.mkdirSync(path.join(ROOT, "lawhist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "lawhist/versions.json"), JSON.stringify(versions, null, 2));
fs.writeFileSync(path.join(ROOT, "lawhist/articles.json"), JSON.stringify(articles));
console.error(`\n시행본 ${versions.length}개, 조문 ${Object.values(articles).reduce((a, b) => a + b.length, 0)}개 저장`);
