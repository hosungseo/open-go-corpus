// timeline.json을 법령연혁 페이지가 쓸 만큼만 추린다.
// 사용: node tools/build-history-data.mjs → lawhist/page-data.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const R = (p) => path.join(ROOT, p);
const T = JSON.parse(fs.readFileSync(R("lawhist/timeline.json"), "utf8"));

const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
// 개정이유에서 ◇ 개정이유 문단만 뽑는다. 주요내용은 너무 길다.
const why = (r) => {
  if (!r) return "";
  let t = r.replace(/^\[[^\]]*\]\s*/, "");
  const m = t.match(/◇\s*개정이유(?: 및 주요내용)?\s*([\s\S]*?)(?=◇\s*주요내용|◇\s*주요골자|$)/);
  t = (m ? m[1] : t).replace(/\s+/g, " ").trim();
  return t;
};

// 앞 시행본과 낱말 단위로 대조해 바뀐 자리만 뽑는다.
// 정책실명제 §63~63의5는 1,300자가 다섯 번 거의 그대로 되풀이된다.
// 전문을 다시 싣는 대신 "안전행정부장관 → 행정자치부장관"처럼 달라진 곳만 남긴다.
function wordDiff(a, b) {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const n = A.length, m = B.length;
  if (!n || !m || n * m > 4_000_000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0, del = [], ins = [];
  const flush = () => {
    if (del.length || ins.length) out.push({ from: del.join(" "), to: ins.join(" ") });
    del = []; ins = [];
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) { flush(); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) del.push(A[i++]);
    else ins.push(B[j++]);
  }
  while (i < n) del.push(A[i++]);
  while (j < m) ins.push(B[j++]);
  flush();
  return out;
}

const LANE = { realname: "rn", preinfo: "pv", original: "og" };
const lanes = T.tracks
  .filter((t) => LANE[t.key])
  .map((t) => ({
    key: t.key,
    lane: LANE[t.key],
    label: t.label,
    steps: t.steps.map((s, i, arr) => {
      const joined = s.texts.map((x) => x.text).join(" ");
      const prev = i ? arr[i - 1].texts.map((x) => x.text).join(" ") : "";
      const delta = i ? wordDiff(prev, joined) : null;
      return {
        ef: ymd(s.efYd),
        year: +s.efYd.slice(0, 4),
        pb: ymd(s.promulgated),
        no: s.no,
        kind: s.kind,
        law: s.lawName,
        change: s.change,
        cites: s.cites.map((c) => `${c.cite}(${c.title})`),
        why: why(s.reason),
        // 조문 전문은 신설·조문 이동일 때만. 나머지는 바뀐 자리만 싣는다.
        texts: s.change === "본문 개정" ? [] : s.texts.map((x) => ({ c: `${x.cite}(${x.title})`, t: x.text })),
        delta: delta && delta.length && delta.length <= 12 ? delta : null,
        deltaBig: !!(delta && delta.length > 12),
      };
    }),
  }));

// 시행령 계보는 별첨 표로만 쓴다.
const decree = T.tracks
  .filter((t) => t.key.endsWith("_d"))
  .map((t) => ({
    key: t.key,
    label: t.label,
    steps: t.steps.map((s) => ({
      ef: ymd(s.efYd),
      kind: s.kind,
      cites: s.cites.map((c) => `${c.cite}(${c.title})`),
      change: s.change,
      why: why(s.reason),
    })),
  }));

const rankOf = { act: "법률", decree: "대통령령", rule: "대통령령" };
const versions = T.versions.map((v) => ({
  k: v.lawKey,
  ef: ymd(v.efYd),
  pb: ymd(v.promulgated),
  no: v.no,
  kind: v.kind,
  name: v.name,
  rank: rankOf[v.lawKey],
  cur: v.status === "현행",
}));

const names = Object.fromEntries(
  Object.entries(T.names).map(([k, v]) => [k, v.map((x) => ({ ef: ymd(x.efYd), name: x.name }))])
);

const counts = {};
for (const v of T.versions) counts[v.lawKey] = (counts[v.lawKey] || 0) + 1;

const data = { generated: T.generated, lanes, decree, versions, names, counts };
fs.writeFileSync(R("lawhist/page-data.json"), JSON.stringify(data));
console.error(
  `page-data.json ${(JSON.stringify(data).length / 1024).toFixed(0)}KB · 레인 ${lanes.length} · 시행본 ${versions.length} · 시행령 계보 ${decree.length}`
);
for (const l of lanes) console.error(`  ${l.label}: 변화 ${l.steps.length}회 (${l.steps.map((s) => s.year).join(", ")})`);
