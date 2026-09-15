// 수집한 시행본에서 세 제도 근거 조문의 계보를 뽑고, 변화 지점의 제·개정이유를 붙인다.
// 사용: node tools/build-law-timeline.mjs
// 입력: lawhist/versions.json, lawhist/articles.json
// 출력: lawhist/timeline.json (+ lawhist/reasons/<mst>.txt 캐시)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const OC = fs.readFileSync(path.join(process.env.HOME, ".openclaw/secrets/law-go-kr-oc"), "utf8").trim();

const versions = JSON.parse(fs.readFileSync(R("lawhist/versions.json"), "utf8"));
const articles = JSON.parse(fs.readFileSync(R("lawhist/articles.json"), "utf8"));

const REASON_DIR = R("lawhist/reasons");
fs.mkdirSync(REASON_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 제·개정이유는 공포본(target=law)에만 붙는다. 시행본 MST로도 조회된다.
async function reason(mst) {
  const file = path.join(REASON_DIR, `${mst}.txt`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  let out = "";
  try {
    const res = await fetch(
      `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=law&type=XML&MST=${mst}`
    );
    const xml = await res.text();
    const m = xml.match(/<제개정이유내용>([\s\S]*?)<\/제개정이유내용>/);
    if (m)
      out = m[1]
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();
  } catch {
    out = "";
  }
  fs.writeFileSync(file, out);
  await sleep(400);
  return out;
}

// 추적 대상 — 조문제목/본문으로 식별한다. 조번호는 전부개정에서 움직이기 때문이다.
const TRACKS = [
  {
    key: "realname",
    label: "정책실명제",
    lawKey: "rule",
    match: (a) => /정책실명제|정책의 실명/.test(a.title) || (a.no === "34" && a.branch === "2"),
  },
  {
    key: "preinfo",
    label: "사전정보공표",
    lawKey: "act",
    match: (a) => /공표|사전적 공개/.test(a.title),
  },
  { key: "original", label: "원문공개", lawKey: "act", match: (a) => /원문/.test(a.title) },
  {
    key: "preinfo_d",
    label: "사전정보공표 (시행령)",
    lawKey: "decree",
    match: (a) => /공표|사전적 공개/.test(a.title),
  },
  {
    key: "original_d",
    label: "원문공개 (시행령)",
    lawKey: "decree",
    match: (a) => /원문/.test(a.title),
  },
];

const norm = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;[^&]*&gt;/g, "")
    .replace(/[·ㆍ]/g, "·")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .trim();
const cite = (a) => `제${a.no}조${a.branch && a.branch !== "0" ? "의" + a.branch : ""}`;

const out = { generated: new Date().toISOString().slice(0, 10), tracks: [], versions: [], names: {} };

for (const t of TRACKS) {
  const vs = versions.filter((v) => v.lawKey === t.lawKey);
  const steps = [];
  let prev = null;
  for (const v of vs) {
    const hits = (articles[v.id] || []).filter(t.match).filter((a) => a.title);
    const sig = hits.map(cite).join(" ");
    const body = hits.map((a) => norm(a.text)).join(" ||| ");
    if (sig === (prev?.sig ?? "") && body === (prev?.body ?? "")) continue;
    steps.push({
      efYd: v.efYd,
      promulgated: v.promulgated,
      no: v.no,
      kind: v.kind,
      lawName: v.name,
      mst: v.mst,
      change: !prev ? "신설" : sig !== prev.sig ? "조문 이동·신설" : "본문 개정",
      cites: hits.map((a) => ({ cite: cite(a), title: a.title })),
      chars: body.length,
      texts: hits.map((a) => ({ cite: cite(a), title: a.title, text: norm(a.text) })),
    });
    prev = { sig, body };
  }
  out.tracks.push({ key: t.key, label: t.label, lawKey: t.lawKey, steps });
}

// 법령 제명 변천 (같은 법령ID 안에서 이름이 바뀐 시점)
for (const lawKey of ["act", "decree", "rule"]) {
  const vs = versions.filter((v) => v.lawKey === lawKey);
  const changes = [];
  let last = null;
  for (const v of vs) {
    const n = v.name.replace(/\s+/g, " ").trim();
    if (n !== last) {
      changes.push({ efYd: v.efYd, name: n, kind: v.kind });
      last = n;
    }
  }
  out.names[lawKey] = changes;
}

out.versions = versions.map((v) => ({
  lawKey: v.lawKey,
  efYd: v.efYd,
  promulgated: v.promulgated,
  no: v.no,
  kind: v.kind,
  name: v.name,
  rank: v.rank,
  status: v.status,
}));

// 변화 지점에만 제·개정이유를 붙인다 (타법개정 이유는 남의 법 이야기라 제외).
for (const tr of out.tracks) {
  for (const s of tr.steps) {
    if (s.kind === "타법개정") continue;
    const r = await reason(s.mst);
    if (r) s.reason = r;
    process.stderr.write(`  ${tr.key} ${s.efYd} ${s.kind} 이유 ${r ? r.length + "자" : "없음"}\n`);
  }
}

fs.writeFileSync(R("lawhist/timeline.json"), JSON.stringify(out, null, 2));
console.error(
  `\ntimeline.json — 계보 ${out.tracks.length}개, 변화 지점 ${out.tracks.reduce((a, t) => a + t.steps.length, 0)}개, 시행본 ${out.versions.length}개`
);
