/* 실사이트 시연 녹화 공용 코어 — lawmorph의 rec-lib 를 가져와 셋을 더했다.
 *   1) 성명 치환 주입(mask): 녹화 시작 전에 직위 앞 2~4자 한글을 ○○○으로 바꾸고, 이후 DOM 변화도 계속 감시한다.
 *   2) 뷰포트 크기 옵션(w,h): 포털 페이지는 1440×900 이 읽기 좋다.
 *   3) 트림 시작점을 steps 가 돌려줄 수 있다(목록 → 상세로 이동한 뒤부터 쓰고 싶을 때).
 * 빌드 전 1회 실행(네트워크 사용). 렌더 시에는 만들어진 mp4 만 쓴다.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR_INIT = () => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = 'fake-cursor';
    c.style.cssText = [
      'position:fixed', 'z-index:99999', 'width:22px', 'height:22px',
      'border-radius:50%', 'pointer-events:none', 'left:-50px', 'top:-50px',
      'border:2px solid rgba(255,255,255,0.95)',
      'background:rgba(56,198,244,0.35)',
      'box-shadow:0 0 12px rgba(56,198,244,0.8)',
      'transform:translate(-50%,-50%)', 'transition:width 0.12s,height 0.12s',
    ].join(';');
    document.body.appendChild(c);
    window.__cursor = c;
    // 화면이 멈추면 스크린캐스트가 프레임을 내지 않아 정지 구간이 영상에서 사라진다.
    // 구석의 거의 안 보이는 점을 계속 움직여 매 프레임 그리게 한다.
    const tick = document.createElement('div');
    tick.id = 'hf-tick';
    tick.style.cssText = 'position:fixed;z-index:99998;right:2px;bottom:2px;width:3px;height:3px;border-radius:50%;background:#000;opacity:0.04;pointer-events:none;animation:hftick 0.4s linear infinite';
    document.body.appendChild(tick);
    const style = document.createElement('style');
    style.textContent = '#fake-cursor.down{width:14px!important;height:14px!important;background:rgba(56,198,244,0.8)!important;} html{scrollbar-width:none} ::-webkit-scrollbar{display:none} @keyframes hftick{0%{transform:translate(0,0)}50%{transform:translate(0,-1px)}100%{transform:translate(0,0)}}';
    document.head.appendChild(style);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  });
};

/* 성명 치환. 직위(주무관·사무관·서기관·과장·국장·실장·담당관·직무대리·차관보·팀장) 앞의 2~4자 한글을 ○○○으로.
 * "박○○ 균형발전제도과장(전결)" 처럼 직위 앞에 부서 조각이 붙어도 잡힌다. 직위·역할·부서명은 그대로 둔다.
 * 원문정보 상세의 「담당자명」 칸은 직위가 없으므로 따로 지운다. */
const MASK_INIT = () => {
  const RE = /(^|[\s>,(·，])([가-힣]{2,4})(?=\s+[가-힣]*(주무관|사무관|서기관|과장|국장|실장|담당관|직무대리|차관보|팀장|장관|차관)(?![가-힣]))/g;
  const maskNode = (n) => {
    if (n.nodeType === 3) { const v = n.nodeValue; if (v && /[가-힣]/.test(v)) { const m = v.replace(RE, '$1○○○'); if (m !== v) n.nodeValue = m; } return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.tagName)) return;
    for (const c of n.childNodes) maskNode(c);
  };
  const maskLabelled = () => {
    for (const th of document.querySelectorAll('th,dt')) {
      if (/^(담당자명|담당자|기안자|결재자)$/.test(th.textContent.trim())) {
        const td = th.nextElementSibling; if (!td) continue;
        const v = td.textContent.trim();
        if (v && !/[○]/.test(v) && !/(주무관|사무관|서기관|과장|국장|실장|담당관)/.test(v)) td.textContent = '○○○';
      }
    }
  };
  const run = () => { maskNode(document.body); maskLabelled(); };
  window.__mask = run;
  addEventListener('DOMContentLoaded', () => {
    run();
    new MutationObserver((muts) => { for (const m of muts) { for (const n of m.addedNodes) maskNode(n); if (m.type === 'characterData') maskNode(m.target); } maskLabelled(); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
};

/** 페이지 조작 헬퍼 묶음 — steps 콜백이 받는다 */
function helpers(page, t0) {
  const cursorTo = async (x, y, ms = 600) => {
    await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 33)) });
    await sleep(120);
  };
  const clickAt = async (x, y) => {
    await page.evaluate(() => window.__cursor?.classList.add('down'));
    await page.mouse.click(x, y);
    await sleep(180);
    await page.evaluate(() => window.__cursor?.classList.remove('down'));
  };
  const box = async (sel) => {
    const el = page.locator(sel).first();
    const b = await el.boundingBox();
    if (!b) throw new Error('no box: ' + sel);
    return b;
  };
  const center = async (sel) => {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) throw new Error('no box: ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** 선택자를 찾아 커서를 옮기고 클릭한 뒤 hold ms 대기. 없으면 건너뛰고 false */
  const click = async (sel, hold = 2000, move = 700) => {
    try {
      const p = await center(sel);
      await cursorTo(p.x, p.y, move);
      await clickAt(p.x, p.y);
      await sleep(hold);
      return true;
    } catch (e) {
      console.log('  skip', sel, '—', e.message);
      return false;
    }
  };
  /** 문서 좌표 y 로 ms 동안 부드럽게 스크롤(ease in-out). 페이지 안에서 rAF 로 움직인다 */
  const scrollTo = async (y, ms = 900) => {
    await page.evaluate(([y, ms]) => new Promise((res) => {
      const y0 = window.scrollY, dy = y - y0, t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; window.scrollTo(0, y0 + dy * e); if (p < 1) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    }), [y, ms]);
    await sleep(80);
  };
  /** 요소(선택자 또는 텍스트 일치 함수 문자열)를 뷰포트의 frac 위치(0=위,0.5=가운데)에 오도록 스크롤 */
  const scrollElTo = async (sel, frac = 0.5, ms = 900) => {
    const y = await page.evaluate(([sel, frac]) => {
      let el = null;
      if (sel.startsWith('text=')) { const t = sel.slice(5); el = [...document.querySelectorAll('th,h1,h2,h3,h4,strong,p,span,div,td,dt')].find((e) => e.children.length === 0 && e.textContent.trim().startsWith(t)) || [...document.querySelectorAll('*')].find((e) => e.children.length <= 2 && e.textContent.trim().startsWith(t)); }
      else el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return window.scrollY + r.top + r.height / 2 - window.innerHeight * frac;
    }, [sel, frac]);
    if (y == null) { console.log('  no element', sel); return false; }
    await scrollTo(Math.max(0, y), ms);
    return true;
  };
  const mark = () => (Date.now() - t0) / 1000;
  return { page, cursorTo, clickAt, center, box, click, scrollTo, scrollElTo, sleep, mark };
}

/**
 * @param {object} o
 * @param {string} o.url        시연할 실사이트 URL
 * @param {string} o.out        결과 mp4 절대경로
 * @param {string} o.tmp        webm 임시 디렉터리
 * @param {string} o.waitFor    첫 화면 준비 판정 선택자
 * @param {number} o.settle     첫 인상 홀드(ms)
 * @param {number} [o.w] [o.h]  뷰포트(기본 1440×900)
 * @param {boolean} [o.mask]    성명 치환 주입
 * @param {{start:number, duration:number}} [o.trim]  잘라낼 구간(초). steps 가 {trimStart} 를 돌려주면 그 값이 start 를 덮는다
 * @param {(h: object) => Promise<void|{trimStart:number}>} o.steps
 */
export async function record({ url, out, tmp, waitFor, settle = 2600, w = 1440, h = 900, mask = true, trim, steps }) {
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { force: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    recordVideo: { dir: tmp, size: { width: w, height: h } },
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.addInitScript(CURSOR_INIT);
  if (mask) await page.addInitScript(MASK_INIT);

  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 포털 상세는 첫 로드 뒤 한 번 더 이동(리로드)하는 경우가 있어 evaluate 가 "context destroyed" 로 죽는다 — 안정될 때까지 기다리고 한 번 더 시도
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await sleep(1200);
  await page.waitForSelector(waitFor, { state: 'visible', timeout: 30000 });
  if (mask) { for (let i = 0; i < 3; i++) { try { await page.evaluate(() => window.__mask && window.__mask()); break; } catch (e) { await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {}); await sleep(1500); } } }
  await sleep(settle);

  const res = await steps(helpers(page, t0));
  await sleep(1500);
  if (mask) {
    // 남은 실명이 있는지 텍스트로 검사한다 — 직위 앞 2~4자 한글이 ○○○이 아닌 것
    const leak = await page.evaluate(() => (document.body.innerText.match(/[가-힣]{2,4}\s*[가-힣]*(주무관|사무관|서기관|과장|국장|실장|담당관|직무대리)(?![가-힣])/g) || []).filter((s) => !/○/.test(s) && !/^(행정|지방행정|기술|균형발전제도|균형발전지원|균형발전|법무|지방자치균형발전|검토|기안|전결|협조|담당|사업)/.test(s)).slice(0, 8));
    console.log('  leak check:', leak.length ? leak : 'clean');
  }

  await ctx.close(); // 비디오 flush
  await browser.close();

  const webm = fs.readdirSync(tmp).filter((f) => f.endsWith('.webm'))
    .map((f) => path.join(tmp, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!webm) throw new Error('녹화 webm 이 없습니다: ' + tmp);
  const tr = trim ? { ...trim, ...(res && res.trimStart != null ? { start: res.trimStart } : {}) } : null;
  console.log('webm:', webm, tr ? `trim ${tr.start}s +${tr.duration}s` : '');
  execFileSync('ffmpeg', ['-y', ...(tr ? ['-ss', String(tr.start)] : []), '-i', webm,
    ...(tr ? ['-t', String(tr.duration)] : []),
    '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out], { stdio: 'inherit' });
  let dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', out]).toString().trim());
  if (tr && dur < tr.duration - 0.05) {
    // 녹화가 목표보다 짧으면 마지막 프레임을 늘여 정확히 목표 길이로
    const padded = out.replace(/\.mp4$/, '.pad.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', `tpad=stop_mode=clone:stop_duration=${(tr.duration - dur).toFixed(3)}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an', padded], { stdio: 'inherit' });
    fs.renameSync(padded, out);
    const d2 = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
    console.log(`  padded ${dur.toFixed(2)}s → ${d2.toFixed(2)}s`);
    dur = d2;
  }
  console.log('->', out, dur + 's');
  return dur;
}
