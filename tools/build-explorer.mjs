#!/usr/bin/env node
// Build the 3제도 대조기 (explorer): realname/*.jsonl + realname/stats → explorer/data.json
// and explorer/index.html (template with the JSON inlined; artifacts cannot fetch).
// Personal names in charger / approval-line fields are masked unless --with-names
// (then output goes to *.local.* and must never be published).
//   node tools/build-explorer.mjs [--with-names]
import fs from "node:fs";
import { auditText, CSS_SCALE, SVG_SCALE } from "./normalize-type.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WITH_NAMES = process.argv.includes("--with-names");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => path.join(ROOT, p);
const readJsonl = (p) => fs.existsSync(R(p)) ? fs.readFileSync(R(p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const readJson = (p) => JSON.parse(fs.readFileSync(R(p), "utf8"));
const SNAPSHOT = "2026-09-15";

/* ── text repair ─────────────────────────────────────────────────────── */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  if (!s) return "";
  let out = String(s);
  for (let i = 0; i < 3; i++) out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENT[k]);
  return out;
}
function repair(s) { return decode(s).replace(/？/g, "·").replace(/\s+/g, " ").trim(); }

/* ── name masking ────────────────────────────────────────────────────── */
const unmatched = [];
const RANK_WORDS = new Set(["사무관","주무관","과장","국장","팀장","서기관","실장","주사","서기","연구관","연구사","장관","차관","청장","차장","처장","위원장","위원","팀원","담당관","담당자","담당","총괄","본부장","부장","소장","원장","직무대리","기안","검토","협조","전결","결재","병렬협조","행정사무관","기술서기관","공업사무관","전산사무관","보건사무관","시설사무관","행정주사","행정서기","지방행정사무관","지방행정주사","정책관","심의관","기획관","조정관","단장","센터장","지원관","대변인","관리관","행정관","연구위원","전문위원","교수","교사","장학사","장학관","교육연구사","경정","경감","경위","경사","경장","순경","총경","소방령","소방경","소방위","소방장","소방교","소방사","일반직","전문임기제"]);
const RANK_RE = "(사무관|주무관|과장|국장|팀장|서기관|실장|연구관|연구사|장관|차관|청장|차장|처장|위원장|정책관|심의관|기획관|단장|센터장)";
const NAME = "([가-힣](?:\\s*[가-힣]){1,3})";
const knownNames = new Set();
const hiNames = new Set();
function maskSegment(seg) {
  let t = seg.replace(/\(?\s*\d{2,4}-\d{3,4}-\d{4}\s*\)?/g, "").replace(/\(\s*\)/g, "").trim();
  if (!t) return "";
  let m;
  const isName = (w) => !RANK_WORDS.has(w.replace(/\s/g, "")) && !/^(행정|기술|공업|전산|보건|시설|세무|관세|교육|지방|일반|국가|정책|기획|총괄|수석|선임|책임|담당|부서)/.test(w);
  const seen = (w, hi = false) => { const k = w.replace(/\s/g, ""); if (k.length >= 2) { knownNames.add(k); if (hi) hiNames.add(k); } return "○○○"; };
  const rankStart = (x) => new RegExp(`^${RANK_RE}`).test(x) || RANK_WORDS.has(x.split(/[\s(]/)[0]) || /^\(/.test(x) || /^\d급/.test(x);
  if ((m = t.match(new RegExp(`^(\\d급(?:\\([^)]*\\))?\\s*)${NAME}\\s*(\\(.*)?$`)))) return `${m[1]}${seen(m[2], true)}${m[3] || ""}`;
  if ((m = t.match(/^([가-힣]{2,4})\s+(\S.*)$/)) && isName(m[1])) return `${seen(m[1], rankStart(m[2]))} ${m[2]}`;
  if ((m = t.match(/^([가-힣]{2,4})(\(.*)$/)) && isName(m[1])) return `${seen(m[1], true)}${m[2]}`;
  if ((m = t.match(new RegExp(`^([가-힣]{2,4})${RANK_RE}(.*)$`))) && isName(m[1])) return `${seen(m[1], true)} ${m[2]}${m[3]}`;
  if ((m = t.match(new RegExp(`^([^:：]{1,14}[:：]\\s*)${NAME}(.*)$`)))) return `${m[1]}${seen(m[2], /담당|부서장|책임|성명|이름|과장|국장|팀장|사무관/.test(m[1]))}${m[3]}`;
  if ((m = t.match(new RegExp(`^(\\([^)]*\\)\\s*)${NAME}(.*)$`)))) return `${m[1]}${seen(m[2], new RegExp(RANK_RE).test(m[1]))}${m[3]}`;
  if ((m = t.match(/^(.*?\)\s*)([가-힣]{2,4})\s+(\S.*)$/)) && isName(m[2])) return `${m[1]}${seen(m[2])} ${m[3]}`;
  if ((m = t.match(/^([가-힣](?:\s+[가-힣]){1,3})$/))) return seen(m[1]);
  if (/^[가-힣]{2,4}$/.test(t)) return isName(t) ? seen(t) : t;
  if ((m = t.match(/^(.{3,}?)\s+([가-힣]{2,4})$/)) && isName(m[2])) return `${m[1]} ${seen(m[2], new RegExp(`${RANK_RE}$`).test(m[1]) || [...RANK_WORDS].some((r) => m[1].endsWith(r)))}`;
  unmatched.push(t);
  return t.replace(/[가-힣]{2,4}/g, (w) => (RANK_WORDS.has(w) ? w : "○○○"));
}
const SURNAME = /^[김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진라나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부]/;
function maskTokens(t) {
  const GLUE = "(과장|국장|팀장|실장|사무관|주무관|서기관|주사|경감|경정|경위|경사|총경|연구관|연구사|본부장|단장|처장|청장|차장|담당관|정책관|심의관)";
  return t.replace(/[가-힣]+/g, (w, off, str) => {
    if (RANK_WORDS.has(w)) return w;
    if (w.length > 4) {
      let g;
      if ((g = w.match(new RegExp(`^${GLUE}([가-힣]{2,4})$`))) && SURNAME.test(g[2])) return `${g[1]} ○○○`;
      if ((g = w.match(new RegExp(`^([가-힣]{2,4})${GLUE}$`))) && SURNAME.test(g[1]) && !/^(행정|기술|공업|전산|보건|시설|세무|관세|교육|지방|일반|국가|정책|기획|총괄)/.test(g[1])) return `○○○ ${g[2]}`;
      return w;
    }
    if (w.length >= 3 && /[과국실팀부처청단관장사급원소센터]$/.test(w) && !SURNAME.test(w)) return w;
    if (w.length === 2) {
      const after = str.slice(off + 2, off + 10), before = str.slice(Math.max(0, off - 10), off);
      const adj = /^\s*(과장|국장|팀장|사무관|주무관|실장|서기관|주사|서기|연구관|연구사|주무|\(|\d급)/.test(after) || /(과장|국장|팀장|사무관|주무관|실장|주무|\d급|담당자|부서장|:|：)\s*$/.test(before);
      return adj ? "○○" : w;
    }
    return "○○○";
  });
}
function mask(s) {
  if (!s) return "";
  if (WITH_NAMES) return decode(s).trim();
  const first = decode(s).split(/(\n|\s*>\s*|,|、|\/)/).map((part, i) => (i % 2 === 1 ? part : maskSegment(part))).join("");
  return maskTokens(first).replace(/\s*>\s*/g, " > ").replace(/\n/g, " · ").replace(/(○○○\s*)+○○○/g, "○○○").replace(/\s{2,}/g, " ").trim();
}
/* ── load ────────────────────────────────────────────────────────────── */
const central = readJsonl("realname/central.jsonl");
const detail = readJsonl("realname/detail.jsonl");
const probes = Object.values(Object.fromEntries(readJsonl("realname/probe-batch.jsonl").map((p) => [p.gclfCd, p]))); // last row per project wins
const stats = {
  bef: [1, 2, 3, 4].map((t) => readJson(`realname/stats/befInf_${t}.json`).modelAndView.model.result.rtnList),
  org: Object.fromEntries(["01", "02", "03", "04"].flatMap((g) => ["2025", "2026"].map((y) => [`${g}_${y}`, readJson(`realname/stats/orgrate_t${g}_${y}.json`).modelAndView.model.result]))),
  cycle: readJson("realname/stats/prev_cycle_sample.json"),
  recent: readJson("realname/stats/prev_recent_sample.json"),
};
const localLinks = fs.readFileSync(R("realname/stats/local_links_checked.tsv"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")).filter((r) => r.length >= 5).map((r) => ({ name: r[0], url: r[1], status: r[2], final: r[3], title: r[4], hit: r[5] || "" }));
const prevLinks = fs.readFileSync(R("realname/stats/prev_links_checked.tsv"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")).filter((r) => r.length >= 3);

/* ── helpers ─────────────────────────────────────────────────────────── */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const n = (v) => { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
function normCrit(s) {
  const t = (s || "").replace(/\s/g, "");
  if (!t) return "(공란)";
  if (/국정|주요정책|현안/.test(t)) return "국정과제·현안";
  if (/예산/.test(t)) return "대규모 예산";
  if (/연구/.test(t)) return "연구용역";
  if (/법령|개폐|제개정|조례/.test(t)) return "법령 개폐";
  if (/국민/.test(t)) return "국민신청";
  return "기타";
}

/* ── projects / orgs ─────────────────────────────────────────────────── */
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const detailMap = Object.fromEntries(detail.map((d) => [`${d.gclfCd}|${d.year}`, d]));
const probeMap = Object.fromEntries(probes.map((p) => [p.gclfCd, p]));
const projects = central.map((r) => {
  const name = repair(r.plcNm);
  const p = {
    id: `${r.gclfCd}|${r.year}`, g: r.gclfCd, y: r.year, cd: r.nstCd, nm: r.nstNm, name,
    dept: repair(r.chgrDeptNm), role: mask(r.chgrNm), period: repair(r.prjtPerd),
    crit: normCrit(r.slctnStdr), critRaw: repair(r.slctnStdr), status: r.statusCd,
    inq: n(r.inqCnt), reg: (r.frstRgstPot || "").slice(0, 10), upd: (r.lastUpdtPot || "").slice(0, 10),
    summary: repair(r.prjtSmry), bg: r.year >= 2025 ? repair(r.prtnCtt) : "",
    hasDetail: !!detailMap[`${r.gclfCd}|${r.year}`], hasProbe: !!probeMap[r.gclfCd],
  };
  if (decode(r.plcNm).trim() !== name) p.raw = decode(r.plcNm).trim();
  if (r.year < 2025 && p.summary.length > 120) p.summary = p.summary.slice(0, 120) + "…";
  return p;
});
const orgMap = {};
for (const p of projects) {
  const o = (orgMap[p.cd] ??= { cd: p.cd, nm: p.nm, years: {}, inq2025: [], sampled: 0, linked: 0 });
  o.years[p.y] = (o.years[p.y] || 0) + 1;
  if (p.y === 2025) o.inq2025.push(p.inq);
}
for (const d of detail) { const o = orgMap[central.find((c) => c.gclfCd === d.gclfCd && c.year === d.year)?.nstCd]; if (o) { o.sampled++; if (d.wonmunCnt > 0) o.linked++; } }
const orgs = Object.values(orgMap).map((o) => ({ cd: o.cd, nm: o.nm, years: o.years, inqMed2025: o.inq2025.length ? median(o.inq2025) : null, sampled: o.sampled, linked: o.linked, lastYear: Math.max(...Object.keys(o.years).map(Number)) })).sort((a, b) => a.nm.localeCompare(b.nm, "ko"));

const details = Object.fromEntries(detail.map((d) => [`${d.gclfCd}|${d.year}`, {
  prtn: d.prtn.map((p) => ({ p: repair(p.prjtPerd), info: decode(p.prtnInfo || "").trim(), aprv: mask(p.aprvInfo) })),
  wonmunCnt: d.wonmun.length,
  wonmun: [...d.wonmun].sort((a, b) => String(b.prdnDt || "").localeCompare(String(a.prdnDt || ""))).slice(0, 30).map((w) => ({ title: repair(w.infoSj), date: (w.prdnDt || "").slice(0, 8), aprv: mask(w.aprvInfo), id: w.prdnNstRgstNo, cd: w.nstCd })),
}]));
const probeOut = Object.fromEntries(probes.map((p) => [p.gclfCd, {
  kwd: p.kwd,
  prev: p.prev?.err ? { err: String(p.prev.err) } : { total: p.prev?.total ?? 0, items: (p.prev?.items || []).map((i) => ({ inst: i.inst, dept: i.dept, title: repair(i.title), detail: repair(i.detail), url: i.url, inq: n(i.inq) })) },
  orginl: p.orginl?.err ? { err: String(p.orginl.err) } : { total: p.orginl?.total ?? 0, items: (p.orginl?.items || []).map((i) => ({ date: i.date, inst: i.inst, dept: i.dept, title: repair(i.title), id: i.id })) },
}]));

/* ── computed values (single source for numbers in the page) ─────────── */
const by = (y) => projects.filter((p) => p.y === y);
const sumLen = median(central.map((c) => repair(c.prjtSmry).length));
const prtnAll = detail.flatMap((d) => d.prtn);
const upd = (y) => { const rs = central.filter((r) => r.year === y); return Math.round(rs.filter((r) => (r.lastUpdtPot || "").slice(0, 10) !== (r.frstRgstPot || "").slice(0, 10)).length / rs.length * 100); };
const inq0 = (y) => { const rs = by(y); return Math.round(rs.filter((p) => p.inq === 0).length / rs.length * 100); };
const nat = (y) => central.filter((r) => r.year === y && /국민/.test(r.slctnStdr || "")).length;
const ent = central.filter((r) => /&#\d+;|&amp;|&lt;|&quot;/.test((r.plcNm || "") + (r.prjtSmry || "") + (r.prtnCtt || ""))).length;
const moj = central.filter((r) => /？/.test((r.plcNm || "") + (r.prjtSmry || "") + (r.prtnCtt || ""))).length;
const idYears = (() => { const m = {}; for (const r of central) (m[r.gclfCd] ??= new Set()).add(r.year); const v = Object.values(m); return { distinct: v.length, multi: v.filter((s) => s.size >= 2).length, five: v.filter((s) => s.size >= 5).length }; })();
const keyRepeat = (() => { const m = {}; for (const r of central) { const k = r.nstNm + "|" + (r.plcNm || "").replace(/\s/g, ""); const e = (m[k] ??= { years: new Set(), ids: new Set() }); e.years.add(r.year); e.ids.add(r.gclfCd); } const v = Object.values(m).filter((e) => e.years.size >= 2); return { multi: v.length, five: v.filter((e) => e.years.size >= 5).length, distinct: Object.keys(m).length, sameId: v.filter((e) => e.ids.size === 1).length, newId: v.filter((e) => e.ids.size > 1).length }; })();
const linked = detail.filter((d) => d.wonmunCnt > 0);
const bad = localLinks.filter((l) => l.status !== "200" || (l.hit && l.hit !== "Y" && !/실명/.test(l.title)));
const befTot = stats.bef.map((l) => ({ cnt: l.reduce((a, x) => a + n(x.cnt), 0), inq: l.reduce((a, x) => a + n(x.inqireCnt), 0) }));
const orgRate = (k) => { const l = stats.org[k].rtnList.filter((x) => x.insttNm); const tot = l.reduce((a, x) => a + n(x.TOTCNT), 0), op = l.reduce((a, x) => a + n(x.OPCNT), 0); return { tot, op, rate: Math.round(op / Math.max(1, tot) * 100), n: l.length, date: l[0]?.othbcRtCalcuStdrDe }; };
const og = { c25: orgRate("01_2025"), c26: orgRate("01_2026"), l25: orgRate("02_2025"), e25: orgRate("03_2025"), p25: orgRate("04_2025") };
const c26list = stats.org["01_2026"].rtnList.filter((x) => x.insttNm).map((x) => ({ nm: x.insttNm, tot: n(x.TOTCNT), op: n(x.OPCNT), rate: Math.round(n(x.OPCNT) / Math.max(1, n(x.TOTCNT)) * 100) })).sort((a, b) => a.rate - b.rate);
const prevBad = prevLinks.filter((r) => r[2] !== "200").length;
const probeDone = probes.filter((p) => !p.prev?.err && !p.orginl?.err);
const probeStats = probeDone.length ? { n: probeDone.length, prev0: probeDone.filter((p) => !(p.prev.total > 0)).length, org0: probeDone.filter((p) => !(p.orginl.total > 0)).length, both0: probeDone.filter((p) => !(p.prev.total > 0) && !(p.orginl.total > 0)).length, prevMed: median(probeDone.map((p) => Number(p.prev.total) || 0)), orgMed: median(probeDone.map((p) => Number(p.orginl.total) || 0)) } : null;

const vals = {
  snapshot: SNAPSHOT,
  rn_total: central.length, rn_inst2018: new Set(by(2018).map((p) => p.cd)).size, rn_2018: by(2018).length,
  rn_inst2025: new Set(by(2025).map((p) => p.cd)).size, rn_2025: by(2025).length, rn_inst2026: new Set(by(2026).map((p) => p.cd)).size, rn_2026: by(2026).length,
  rn_unreg2026: orgs.filter((o) => o.years[2025] && !o.years[2026]).length,
  rn_sumlen: sumLen, rn_prtn_med: median(detail.map((d) => d.prtnCnt)), rn_prtn_len: median(prtnAll.map((p) => (p.prtnInfo || "").length)), rn_aprv_rate: Math.round(prtnAll.filter((p) => (p.aprvInfo || "").trim()).length / Math.max(1, prtnAll.length) * 100),
  rn_detail_n: detail.length, rn_linked: linked.length, rn_linked_rate: Math.round(linked.length / Math.max(1, detail.length) * 100), rn_linked_med: median(linked.map((d) => d.wonmunCnt)),
  rn_upd2024: upd(2024), rn_upd2025: upd(2025), rn_inqmed2018: median(by(2018).map((p) => p.inq)), rn_inqmed2025: median(by(2025).map((p) => p.inq)), rn_inqmed2026: median(by(2026).map((p) => p.inq)), rn_inq0_2025: inq0(2025), rn_inq0_2026: inq0(2026),
  rn_nat2018: nat(2018), rn_nat2025: nat(2025), rn_ent: ent, rn_ent_pct: Math.round(ent / central.length * 100), rn_moj: moj, rn_moj_pct: Math.round(moj / central.length * 100),
  rn_repeat: keyRepeat.multi, rn_repeat5: keyRepeat.five, rn_repeat_sameid: keyRepeat.sameId, rn_repeat_newid: keyRepeat.newId, rn_ids: idYears.distinct, rn_ids_multi: idYears.multi, rn_ids5: idYears.five, rn_links: localLinks.length, rn_links_bad: bad.length, rn_per_org2025: (by(2025).length / new Set(by(2025).map((p) => p.cd)).size).toFixed(1),
  pv_total: stats.cycle.total_list, pv_c: befTot[0].cnt, pv_l: befTot[1].cnt, pv_e: befTot[2].cnt, pv_p: befTot[3].cnt, pv_inq_c: (befTot[0].inq / befTot[0].cnt).toFixed(1), pv_inq_l: (befTot[1].inq / befTot[1].cnt).toFixed(1), pv_inq_p: (befTot[3].inq / befTot[3].cnt).toFixed(1),
  pv_detail_len: stats.recent.detail_len_median, pv_recent_n: stats.recent.n, pv_recent_inq0: Math.round(stats.recent.inq_zero / stats.recent.n * 100),
  pv_cycle_n: stats.cycle.n, pv_cy_year: stats.cycle.cycle["매년"] || 0, pv_cy_adhoc: stats.cycle.cycle["수시"] || 0, pv_cy_month: stats.cycle.cycle["매월"] || 0, pv_cy_half: stats.cycle.cycle["반기"] || 0, pv_cy_q: stats.cycle.cycle["분기"] || 0, pv_cy_week: stats.cycle.cycle["매주"] || 0,
  pv_links_n: prevLinks.length, pv_links_bad: prevBad, pv_org450: stats.bef[3].length,
  og_c25_tot: og.c25.tot, og_c25_op: og.c25.op, og_c25_rate: og.c25.rate, og_c26_rate: og.c26.rate, og_c26_tot: og.c26.tot, og_c26_op: og.c26.op,
  og_l25_tot: og.l25.tot, og_l25_rate: og.l25.rate, og_e25_tot: og.e25.tot, og_e25_rate: og.e25.rate, og_p25_tot: og.p25.tot, og_p25_rate: og.p25.rate, og_p25_n: og.p25.n,
  og_all25: og.c25.tot + og.l25.tot + og.e25.tot + og.p25.tot, og_noedu25: og.c25.tot + og.l25.tot + og.p25.tot,
  og_low1: `${c26list[1]?.nm} ${c26list[1]?.rate}%`, og_low2: `${c26list[2]?.nm} ${c26list[2]?.rate}%`, og_high: `${c26list.at(-1)?.nm} ${c26list.at(-1)?.rate}%`,
  og_body_chars: 28659, og_body_n: 417,
  probe_n: probeStats?.n ?? 0, probe_prev0: probeStats?.prev0 ?? 0, probe_org0: probeStats?.org0 ?? 0, probe_both0: probeStats?.both0 ?? 0, probe_prev_med: probeStats?.prevMed ?? 0, probe_org_med: probeStats?.orgMed ?? 0,
  law_reg: "2026-05-19", law_act: "2023-11-17", law_dec: "2026-01-02",
};

/* ── notes (footnotes) ──────────────────────────────────────────────── */
const notes = [
  { id: "n_rn_source", text: `정책실명제 중앙행정기관 2018~2026년 전수 ${vals.rn_total.toLocaleString()}건. 포털 polRnInsttList.ajax(기관 목록)와 polRnBList.do(기관별 사업, 페이지 내장 JSON)에서 수집. 세션 없이 받아진다. 2025~2026년 ${vals.rn_detail_n}건은 polRnInsttDetail.do 상세까지 확인.`, sample: `${vals.rn_total.toLocaleString()}건 / 상세 ${vals.rn_detail_n}건`, date: SNAPSHOT },
  { id: "n_rn_depth", text: `사업개요(prjtSmry) 글자 수는 절반이 ${vals.rn_sumlen}자 이하(전수). 추진실적은 상세 ${vals.rn_detail_n}건 기준 사업당 절반이 ${vals.rn_prtn_med}건 이하, 추진내용 글자 수는 절반이 ${vals.rn_prtn_len}자 이하, 결재선 기재율 ${vals.rn_aprv_rate}%. 예산·집행 관련 필드는 목록·상세 어디에도 없음.`, sample: `${vals.rn_detail_n}건`, date: SNAPSHOT },
  { id: "n_rn_update", text: `등록일(frstRgstPot)과 최종수정일(lastUpdtPot)이 다른 사업 비율: 2024년 ${vals.rn_upd2024}%, 2025년 ${vals.rn_upd2025}%. 2025년 수정 간격은 절반이 5일 이내 → 현행화가 아니라 등록 직후 정정.`, sample: "전수", date: SNAPSHOT },
  { id: "n_rn_inq", text: `정보공개포털 조회수(inqCnt)는 한가운데 사업 기준 2018년 ${vals.rn_inqmed2018}회 → 2025년 ${vals.rn_inqmed2025}회 → 2026년 ${vals.rn_inqmed2026}회. 포털에서 한 번도 열리지 않은 사업은 2025년 ${vals.rn_inq0_2025}%, 2026년 ${vals.rn_inq0_2026}%. 이 값은 두 방향으로 어긋난다. 상세 페이지 진입 시 올라가는 값이라 내부 확인·봇이 섞여 부풀 수 있고, 규정 제63조의3제3항이 정한 공개 장소인 해당 기관 누리집의 열람은 빠져 있어 줄어들 수도 있다. 제도가 실제로 얼마나 읽히는지는 이 값으로 알 수 없다.`, sample: "전수", date: SNAPSHOT },
  { id: "n_rn_local", text: `정책실명제 첫 화면의 지자체·교육청 외부 링크 ${vals.rn_links}개를 HTTP로 열어 상태코드·최종 URL·페이지 내 '실명' 문자열 유무를 확인. 404·응답없음 또는 메인·업무추진비·로그인 화면으로 떨어진 링크 ${vals.rn_links_bad}개. '엉뚱한 곳' 판정은 문자열 부재 기준이라 실제는 더 많을 수 있음.`, sample: `${vals.rn_links}개`, date: SNAPSHOT },
  { id: "n_rn_request", text: `선정기준(slctnStdr)에 '국민'이 포함된 사업 수: 2018년 ${vals.rn_nat2018}건 → 2025년 ${vals.rn_nat2025}건. 규정 §63의3①5호의 국민 신청 사업. 포털에 신청 창구는 없고 기관이 각자 접수.`, sample: "전수", date: SNAPSHOT },
  { id: "n_rn_quality", text: `HTML 엔티티(&#40; 등)가 그대로 노출된 사업 ${vals.rn_ent.toLocaleString()}건(${vals.rn_ent_pct}%), 가운뎃점이 '？'로 깨진 사업 ${vals.rn_moj.toLocaleString()}건(${vals.rn_moj_pct}%). 이 페이지에서는 복구해 표시하고 원문을 작은 글씨로 병기. 선정기준은 자유입력(15가지 이상 표기)이라 6호 체계로 정규화해 표시하고 원문 병기. 사업 ID(gclfCd)는 ${vals.rn_total.toLocaleString()}행에 ${vals.rn_ids.toLocaleString()}개이며 ${vals.rn_ids_multi.toLocaleString()}개가 2년 이상, ${vals.rn_ids5}개가 5년 이상 같은 ID로 이어진다. 기관명+사업명이 같은 반복 사업 ${vals.rn_repeat.toLocaleString()}개 중 ID가 유지된 것은 ${vals.rn_repeat_sameid}개, 새 ID로 다시 등록된 것은 ${vals.rn_repeat_newid}개라 연도 간 연결이 일관되지 않고, 포털 화면은 연도별 목록뿐이라 이력을 이어 볼 수 없다.`, sample: "전수", date: SNAPSHOT },
  { id: "n_pv_source", text: `사전정보공표 총 항목 수는 포털 목록 total ${vals.pv_total.toLocaleString()}. 기관유형별 항목·조회 합계는 '숫자로 보는 정보공개 > 사전정보수'(befInf.ajax): 중앙 ${vals.pv_c.toLocaleString()} · 지방자치단체 ${vals.pv_l.toLocaleString()} · 교육청 ${vals.pv_e.toLocaleString()} · 공공기관 ${vals.pv_p.toLocaleString()}(${vals.pv_org450}곳). 합계가 목록 total과 약간 다른 것은 통계 집계 시점 차이.`, sample: "포털 통계", date: SNAPSHOT },
  { id: "n_pv_depth", text: `항목 구조는 상세 페이지 내장 JSON 기준: 제목(bfpbInfoSj)·세부항목(dtlDtls)·주기(cycleNm)·시기(eraDtls)·공개방법(mthCd)·홈페이지(infoLcUrl). 세부항목 글자 수는 절반이 ${vals.pv_detail_len}자 이하(최근 ${vals.pv_recent_n}건 표본, 49일치 신규 등록). 내용 본문은 포털에 없고 링크 너머에 있음.`, sample: `${vals.pv_recent_n}건`, date: SNAPSHOT },
  { id: "n_pv_cycle", text: `주기(cycleNm) 분포, 최근 등록 항목 ${vals.pv_cycle_n}개 표본: 매년 ${vals.pv_cy_year} · 수시 ${vals.pv_cy_adhoc} · 매월 ${vals.pv_cy_month} · 반기 ${vals.pv_cy_half} · 분기 ${vals.pv_cy_q} · 매주 ${vals.pv_cy_week}. 표본이 작아 전체 비율과 다를 수 있음.`, sample: `${vals.pv_cycle_n}개`, date: SNAPSHOT },
  { id: "n_pv_links", text: `사전정보 항목의 기관 홈페이지 링크 ${vals.pv_links_n}개 무작위 표본 중 ${vals.pv_links_bad}개가 404·500·리다이렉트·타임아웃.`, sample: `${vals.pv_links_n}개`, date: SNAPSHOT },
  { id: "n_pv_use", text: `누적 조회수 합계를 항목 수로 나눈 값: 중앙 ${vals.pv_inq_c}회 · 지방자치단체 ${vals.pv_inq_l}회 · 공공기관 ${vals.pv_inq_p}회. 최근 49일 신규 ${vals.pv_recent_n}항목 중 ${vals.pv_recent_inq0}%가 조회 0.`, sample: "포털 통계", date: SNAPSHOT },
  { id: "n_og_source", text: `원문공개 등록·공개 건수는 '숫자로 보는 정보공개 > 원문공개율'(orgOthbcRate.ajax, gvrnType 01~04). 2025년 연간(12월 31일 기준): 중앙 ${vals.og_c25_tot.toLocaleString()} 등록 / ${vals.og_c25_op.toLocaleString()} 공개(${vals.og_c25_rate}%) · 지자체 ${vals.og_l25_tot.toLocaleString()}(${vals.og_l25_rate}%) · 교육청 ${vals.og_e25_tot.toLocaleString()}(${vals.og_e25_rate}%, 각급 학교 포함 표시값) · 공기업·준정부기관 ${vals.og_p25_n}곳 ${vals.og_p25_tot.toLocaleString()}(${vals.og_p25_rate}%). 2026년 8월 31일 기준 중앙 ${vals.og_c26_tot.toLocaleString()} / ${vals.og_c26_op.toLocaleString()}(${vals.og_c26_rate}%).`, sample: "포털 통계", date: SNAPSHOT },
  { id: "n_og_depth", text: `원문 1건의 분량은 코퍼스 본문 수집 ${vals.og_body_n}건 평균 ${vals.og_body_chars.toLocaleString()}자(본문 PDF + 첨부 HWP). 결재선은 정책실명제 상세의 '관련 원문' aprvInfo 필드에 '기안 > 검토 > 병렬협조 > 전결' 형태로 들어 있음.`, sample: `${vals.og_body_n}건`, date: "2026-08-22" },
  { id: "n_og_scope", text: `"중앙은 국장급 이상 결재문서만 원문공개 대상"이라는 범위는 정보공개과 담당자 설명이며, 코퍼스 결재자 직급 코드 분포(한 코드가 91%)와 부합하나 시행령·지침 문구로 재확인이 필요함. 기관별 공개율은 2026년 8월 기준 최저 ${vals.og_low1}, ${vals.og_low2}, 최고 ${vals.og_high}.`, sample: "구두 확인", date: SNAPSHOT },
  { id: "n_probe", text: `사업 대조는 2025~2026년 정책실명제 사업 ${vals.probe_n}건에 대해 사업명에서 불용어·접미어를 뗀 첫 명사구 하나를 검색어로 삼아 (가) 사전정보공표 전 기관·2014년 이후, (나) 원문공개 해당 기관·2025년 1월 1일 이후를 포털 검색(AJAX)한 결과. 검색어 규칙은 자동이라 사업에 따라 너무 넓거나(예: '개인정보') 좁을 수 있음. 각 결과 첫 줄에 검색어를 표시. 2018~2024년 사업은 대조 미수집. 결과: ${vals.probe_n}건 중 사전정보 0건 ${vals.probe_prev0}건, 원문 0건 ${vals.probe_org0}건, 둘 다 0건 ${vals.probe_both0}건.`, sample: `${vals.probe_n}건`, date: SNAPSHOT },
  { id: "n_names", text: WITH_NAMES ? "이 빌드는 실명을 포함한 로컬 전용본이다. 배포 금지." : "담당자·결재선의 성명은 빌드 단계에서 ○○○로 치환하고 직급·역할만 남겼다. 원본은 로컬에만 있다.", sample: "-", date: SNAPSHOT },
  { id: "n_2026", text: `2026년은 등록이 진행 중인 값(9월 15일 현재 ${vals.rn_inst2026}기관 ${vals.rn_2026}건). 추세 판단은 2025년까지로 하고, 2025년 등록 ${vals.rn_inst2025}기관 중 ${vals.rn_unreg2026}곳이 9월 중순까지 미등록이라는 사실만 확정으로 본다.`, sample: "-", date: SNAPSHOT },
  { id: "n_orgnames", text: "기관명은 포털 코드표의 현행 명칭을 따른다(예: 산업통상부·성평등가족부·국가데이터처). 과거 연도 등록분도 현행 명칭으로 표시되므로 부처 개편 전후가 한 행으로 이어진다.", sample: "-", date: SNAPSHOT },
  { id: "n_law", text: `법령은 law.go.kr 현행 조문(${SNAPSHOT} 조회): 행정업무의 운영 및 혁신에 관한 규정(대통령령, ${vals.law_reg} 시행) 제63조~제63조의5 / 공공기관의 정보공개에 관한 법률(${vals.law_act} 시행) 제7조·제8조의2 / 같은 법 시행령(${vals.law_dec} 시행) 제4조·제5조의2.`, sample: "-", date: SNAPSHOT },
];

/* ── scoreboard rows ─────────────────────────────────────────────────── */
const scoreboard = {
  rn: { name: "정책실명제", law: "대통령령 §63~63의5", what: "중점관리 대상사업을 골라 담당자·선정사유·추진실적을 적는 사업 단위 명부", rows: [
    ["법적 근거", "행정업무의 운영 및 혁신에 관한 규정(대통령령). 법률 근거 없음", "n_law"],
    ["대상기관", "행정기관·지자체·교육청 (공공기관 제외)", "n_law"],
    ["공개 단위", "사업 1건", "n_rn_source"],
    ["단위당 깊이", `개요 절반이 ${vals.rn_sumlen}자 이하 · 추진실적 ${vals.rn_prtn_med}건×${vals.rn_prtn_len}자 · 담당자 1명+결재선. 예산 필드 없음`, "n_rn_depth"],
    ["주기", `연 1회 등록. 등록 후 수정 ${vals.rn_upd2025}% (정정 수준)`, "n_rn_update"],
    ["규모", `중앙 2018년 ${vals.rn_2018}건 → 2025년 ${vals.rn_2025}건 · 2026년 9월 ${vals.rn_2026}건(진행 중)`, "n_rn_source"],
    ["이용", `한가운데 사업의 조회수 ${vals.rn_inqmed2025}회(2025) · 2026년 ${vals.rn_inq0_2026}% 조회 0`, "n_rn_inq"],
    ["지자체", `포털에 데이터 없음. 링크 ${vals.rn_links}개 중 ${vals.rn_links_bad}개 오류`, "n_rn_local"],
  ] },
  pv: { name: "사전정보공표", law: "정보공개법 §7 · 시행령 §4", what: "기관이 \"무엇을 어디에 언제 공개한다\"를 미리 정해 알리는 안내 목록", rows: [
    ["법적 근거", "공공기관의 정보공개에 관한 법률 제7조. 범위·주기·시기·방법을 기관이 미리 정함", "n_law"],
    ["대상기관", `공공기관 전체 (포털 등록 공공기관 ${vals.pv_org450}곳)`, "n_pv_source"],
    ["공개 단위", "정보 항목 1건 (제목+한 줄+링크)", "n_pv_depth"],
    ["단위당 깊이", `세부항목 절반이 ${vals.pv_detail_len}자 이하 + 기관 홈페이지 링크. 내용은 포털 밖`, "n_pv_depth"],
    ["주기", `매년 ${vals.pv_cy_year}% · 수시 ${vals.pv_cy_adhoc}% · 월/분기/반기 ${vals.pv_cy_month + vals.pv_cy_half + vals.pv_cy_q}% (표본 ${vals.pv_cycle_n})`, "n_pv_cycle"],
    ["규모", `${vals.pv_total.toLocaleString()}항목 (중앙 ${(vals.pv_c / 1e4).toFixed(1)}만 · 지자체 ${(vals.pv_l / 1e4).toFixed(1)}만 · 교육청 ${(vals.pv_e / 1e4).toFixed(1)}만 · 공공기관 ${(vals.pv_p / 1e4).toFixed(1)}만)`, "n_pv_source"],
    ["이용", `항목당 누적 조회 중앙 ${vals.pv_inq_c}회 · 지자체 ${vals.pv_inq_l}회. 신규 ${vals.pv_recent_inq0}% 조회 0`, "n_pv_use"],
    ["지자체", `항목은 포털에, 내용은 각 홈페이지에. 링크 표본 ${vals.pv_links_n}개 중 ${vals.pv_links_bad}개 오류`, "n_pv_links"],
  ] },
  og: { name: "원문공개", law: "정보공개법 §8의2 · 시행령 §5의2", what: "전자결재가 끝난 문서를 청구 없이 그대로 올리는 문서 원본 공개", rows: [
    ["법적 근거", "공공기관의 정보공개에 관한 법률 제8조의2. 공개대상 분류 전자문서를 청구 없이 공개", "n_law"],
    ["대상기관", "중앙·소속기관·위원회·지자체·각급학교·공기업·준정부기관", "n_law"],
    ["공개 단위", "결재문서 1건 (본문·첨부·결재선)", "n_og_depth"],
    ["단위당 깊이", `본문·첨부 전체 평균 ${vals.og_body_chars.toLocaleString()}자 + 결재선 실명(기안·검토·협조·전결)`, "n_og_depth"],
    ["주기", "결재 즉시 상시. 평일 하루 4,000건(중앙·지자체)", "n_og_source"],
    ["규모", `2025년 등록 ${Math.round(vals.og_all25 / 1e4).toLocaleString()}만 건 (교육청·학교 제외 ${Math.round(vals.og_noedu25 / 1e4).toLocaleString()}만)`, "n_og_source"],
    ["공개율", `중앙 ${vals.og_c25_rate}% · 지자체 ${vals.og_l25_rate}% · 공공기관 ${vals.og_p25_rate}% · 교육청 ${vals.og_e25_rate}% (2025)`, "n_og_source"],
    ["범위", `중앙은 국장급 이상 결재문서(재확인 필요). 기관별 ${vals.og_low1} ~ ${vals.og_high}`, "n_og_scope"],
  ] },
};

/* ── free-text scrub: high-confidence person names (3 chars, surname-start) ── */
const freeText = projects.map((p) => [p.cd, p.summary + " " + p.bg]);
const orgCount = (w) => { const re = new RegExp(`(?<![가-힣])${w}(?![가-힣])`); return new Set(freeText.filter(([cd, t]) => re.test(t)).map(([cd]) => cd)).size; };
const scrubNames = [...hiNames].filter((w) => w.length === 3 && SURNAME.test(w) && !/[과국실팀부처청단관장사급원소자권전지식형야]$/.test(w) && orgCount(w) <= 1);
const scrubRe = scrubNames.length ? new RegExp(`(?<![가-힣])(?:${scrubNames.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![가-힣])`, "g") : null;
let scrubbed = 0;
const scrub = (t) => (!scrubRe || WITH_NAMES || !t) ? t : t.replace(scrubRe, () => { scrubbed++; return "○○○"; });
for (const p of projects) { p.summary = scrub(p.summary); p.bg = scrub(p.bg); p.name = scrub(p.name); if (p.raw) p.raw = scrub(p.raw); }
for (const d of Object.values(details)) { for (const x of d.prtn) x.info = scrub(x.info); for (const w of d.wonmun) w.title = scrub(w.title); }
for (const pr of Object.values(probeOut)) { for (const k of ["prev", "orginl"]) for (const i of (pr[k].items || [])) { i.title = scrub(i.title); if (i.detail) i.detail = scrub(i.detail); } }
console.error(`free-text scrub: ${scrubNames.length} names, ${scrubbed} replacements`);

/* ── default example project (4A): institution + name, resolved to id; latest year wins ── */
const DEFAULT_PROJECT = { nm: "행정안전부", name: "풍수해보험사업 운영" };
const dpCands = projects.filter((p) => p.nm === DEFAULT_PROJECT.nm && p.name.replace(/\s/g, "") === DEFAULT_PROJECT.name.replace(/\s/g, "")).sort((a, b) => b.y - a.y);
const defaultProject = dpCands[0]?.id ?? null;
if (!defaultProject) console.error(`WARN default project not found: ${DEFAULT_PROJECT.nm} / ${DEFAULT_PROJECT.name} — page falls back to first list item`);
else console.error(`default project: ${dpCands[0].nm} · ${dpCands[0].name} · ${dpCands[0].y}`);

/* ── assemble & validate ────────────────────────────────────────────── */
const data = {
  snapshot: SNAPSHOT, withNames: WITH_NAMES, defaultProject,
  build: { at: new Date().toISOString().slice(0, 19).replace("T", " "), command: "node tools/build-explorer.mjs", projects: projects.length, details: detail.length, probes: probes.length },
  vals, notes, scoreboard, years: YEARS, orgs, projects, details, probes: probeOut,
  localLinks: localLinks.map((l) => ({ name: l.name, url: l.url, status: l.status, final: l.final, hit: l.hit, title: l.title })),
};
const tpl = fs.readFileSync(R("explorer/template.html"), "utf8");
const noteIds = new Set(notes.map((x) => x.id));
const refs = [...tpl.matchAll(/data-note="([^"$]+)"/g)].map((m) => m[1]);
const missing = refs.filter((r) => !noteIds.has(r));
if (missing.length) { console.error("missing notes:", [...new Set(missing)]); process.exit(1); }
const valRefs = [...tpl.matchAll(/data-v="([^"$]+)"/g)].map((m) => m[1]);
const missingV = valRefs.filter((r) => !(r in vals));
if (missingV.length) { console.error("missing vals:", [...new Set(missingV)]); process.exit(1); }

const suffix = WITH_NAMES ? ".local" : "";
fs.mkdirSync(R("explorer"), { recursive: true });
const json = JSON.stringify(data);
if (!WITH_NAMES) {
  const leaks = [];
  for (const nm of knownNames) if (nm.length >= 3 && json.includes(nm)) leaks.push(nm);
  console.error(`leak check: known names ${knownNames.size}, appearing in output ${leaks.length}${leaks.length ? " e.g. " + leaks.slice(0, 8).join(", ") : ""}`);
}
fs.writeFileSync(R(`explorer/data${suffix}.json`), json);
const CSS_PATH = R("docs/src/shared.css");
if (!fs.existsSync(CSS_PATH)) { console.error("ERROR shared CSS missing: docs/src/shared.css"); process.exit(1); }
const sharedCss = fs.readFileSync(CSS_PATH, "utf8");
if (!tpl.includes("/*__SHARED_CSS__*/")) { console.error("ERROR explorer template lacks /*__SHARED_CSS__*/ marker"); process.exit(1); }
const html = tpl.replace("/*__SHARED_CSS__*/", () => sharedCss).replace("/*__DATA__*/", () => json.replace(/<\//g, "<\\/"));
fs.writeFileSync(R(`explorer/index${suffix}.html`), html);
if (!WITH_NAMES) {
  fs.mkdirSync(R("docs/explorer"), { recursive: true });
  fs.writeFileSync(R("docs/explorer/index.html"), html);
  // static pages: docs/src/*.html → docs/*.html with shared.css inlined; any leftover local stylesheet link fails the build
  const LAWDATA_PATH = R("lawhist/page-data.json");
  const NOTE_PATH = R("notes/citizen.json");
  const CH_PATH = R("notes/citizen-channels.json");
  const AX_PATH = R("notes/compare-axes.json");
  const VN_PATH = R("notes/venue.json");
  const TF_PATH = R("notes/three-faces.json");
  const GJ_PATH = R("notes/gukjeong.json");
  for (const name of ["index", "compare", "history", "policy2", "notes"]) {
    const src = R(`docs/src/${name}.html`);
    if (!fs.existsSync(src)) { console.error(`ERROR static source missing: docs/src/${name}.html`); process.exit(1); }
    let page = fs.readFileSync(src, "utf8");
    const linkRe = /<link\s+rel="stylesheet"\s+href="shared\.css"\s*\/?>/;
    if (!linkRe.test(page)) { console.error(`ERROR docs/src/${name}.html has no <link rel="stylesheet" href="shared.css">`); process.exit(1); }
    page = page.replace(linkRe, () => `<style>\n${sharedCss}\n</style>`);
    if (/<link\s+rel="stylesheet"\s+href="(?!https?:)/.test(page)) { console.error(`ERROR docs/src/${name}.html still references a local stylesheet after inlining`); process.exit(1); }
    if (page.includes("/*__NOTEDATA__*/")) {
      if (!fs.existsSync(NOTE_PATH)) { console.error("ERROR notes/citizen.json missing - run tools/analyze-citizen.mjs"); process.exit(1); }
      const nd = fs.readFileSync(NOTE_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__NOTEDATA__*/null", () => nd).replace("/*__NOTEDATA__*/", () => nd);
    }
    if (page.includes("/*__CHDATA__*/")) {
      if (!fs.existsSync(CH_PATH)) { console.error("ERROR notes/citizen-channels.json missing"); process.exit(1); }
      const cd = fs.readFileSync(CH_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__CHDATA__*/null", () => cd).replace("/*__CHDATA__*/", () => cd);
    }
    {
      const bad = auditText(page);
      if (bad.length) {
        const uniq = [...new Set(bad)].sort();
        console.error(`ERROR ${name}: 글자 크기 자에 없는 값 ${uniq.length}종 — ${uniq.join(", ")}`);
        console.error(`  css 자: ${CSS_SCALE.join(" ")} · svg 자: ${SVG_SCALE.join(" ")}`);
        console.error(`  고치려면: node tools/normalize-type.mjs`);
        process.exit(1);
      }
    }
    if (page.includes("/*__GJDATA__*/")) {
      if (!fs.existsSync(GJ_PATH)) { console.error("ERROR notes/gukjeong.json missing"); process.exit(1); }
      const gd = fs.readFileSync(GJ_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__GJDATA__*/null", () => gd).replace("/*__GJDATA__*/", () => gd);
    }
    if (page.includes("/*__TFDATA__*/")) {
      if (!fs.existsSync(TF_PATH)) { console.error("ERROR notes/three-faces.json missing"); process.exit(1); }
      const td = fs.readFileSync(TF_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__TFDATA__*/null", () => td).replace("/*__TFDATA__*/", () => td);
    }
    if (page.includes("/*__VNDATA__*/")) {
      if (!fs.existsSync(VN_PATH)) { console.error("ERROR notes/venue.json missing"); process.exit(1); }
      const vd = fs.readFileSync(VN_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__VNDATA__*/null", () => vd).replace("/*__VNDATA__*/", () => vd);
    }
    if (page.includes("/*__AXDATA__*/")) {
      if (!fs.existsSync(AX_PATH)) { console.error("ERROR notes/compare-axes.json missing"); process.exit(1); }
      const ad = fs.readFileSync(AX_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__AXDATA__*/null", () => ad).replace("/*__AXDATA__*/", () => ad);
    }
    if (page.includes("/*__LAWDATA__*/")) {
      if (!fs.existsSync(LAWDATA_PATH)) { console.error("ERROR lawhist/page-data.json missing - run tools/collect-law-history.mjs then tools/build-law-timeline.mjs then tools/build-history-data.mjs"); process.exit(1); }
      const lawJson = fs.readFileSync(LAWDATA_PATH, "utf8").replace(/<\//g, "<\\/");
      page = page.replace("/*__LAWDATA__*/null", () => lawJson).replace("/*__LAWDATA__*/", () => lawJson);
    }
    fs.writeFileSync(R(`docs/${name}.html`), page);
  }
  console.error("static pages built: docs/index.html docs/compare.html docs/history.html docs/policy2.html docs/notes.html (shared.css inlined)");
}
console.error(`built explorer/index${suffix}.html ${(html.length / 1e6).toFixed(1)}MB · projects ${projects.length} · details ${detail.length} · probes ${probes.length} · notes ${notes.length} · unmatched name segments ${unmatched.length}`);
if (unmatched.length) console.error("  unmatched (first 15):", [...new Set(unmatched)].slice(0, 15));
