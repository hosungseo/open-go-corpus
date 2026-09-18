#!/usr/bin/env python3
"""index.html 을 챕터별 렌더 파일로 쪼갠다.

hyperframes 0.8.15 렌더러가 약 46초 이후 클립을 캡처하지 못하는 버그가 있어
(스냅샷·프리뷰는 정상) 챕터별로 나눠 렌더한 뒤 ffmpeg 로 이어붙인다.
각 챕터 파일은 대상 챕터를 t=0 으로 옮기고 나머지 챕터는 타임라인 밖(900초)으로 보낸다.

프로젝트 밖(기본 /private/tmp/three-faces-chapters)에 쓰는 이유:
  - compositions/ 아래에 두면 assets/ 상대경로가 404 나서 화면이 통째로 빈다
  - 프로젝트 안에 루트 컴포지션이 둘 이상이면 lint 가 막는다
render-all.sh 가 챕터 파일을 index.html 자리에 잠시 복사해 렌더한다.
"""
import re, os, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUTDIR = os.environ.get('HF_CHAPTER_DIR', '/private/tmp/three-faces-chapters')

# (챕터키, 길이, 이 챕터에 속한 클립 id들, 자막 번호)  — 순서가 곧 이어붙일 순서
CHAPTERS = [
    ('open', 11.2, ['stage-open'], []),
    ('concl', 15.4, ['stage-concl'], [1]),
    ('cmp', 32.0, ['stage-cmp'], [2]),
    ('ents', 10.1, ['stage-ents'], []),
    ('rnA', 21.9, ['stage-rnA'], []),
    ('rnB', 27.9, ['stage-rnB'], [3]),
    ('rnC', 18.4, ['stage-rnC'], [4]),
    ('pvA', 17.2, ['stage-pvA'], []),
    ('pvB', 11.0, ['stage-pvB'], [5]),
    ('pvC', 19.4, ['stage-pvC'], [6]),
    ('ogA', 21.2, ['stage-ogA'], []),
    ('ogB', 16.0, ['stage-ogB'], [7]),
    ('ogC', 19.0, ['stage-ogC'], [8]),
    ('same', 29.0, ['stage-same', 'gapvid'], [9]),
    ('comp', 35.5, ['stage-comp', 'openvid'], [10]),
    ('close', 17.0, ['stage-close'], [11]),
    ('thanks', 7.0, ['stage-thanks'], []),
]

def read_starts(html):
    """id -> data-start (원본 절대 시각)"""
    out = {}
    for m in re.finditer(r'<[a-z]+[^>]*(?<![-\w])id="([^"]+)"[^>]*\bdata-start="([0-9.]+)"', html):
        out[m.group(1)] = float(m.group(2))
    return out

def set_start(html, elid, val):
    pat = re.compile(r'(<[a-z]+[^>]*(?<![-\w])id="' + re.escape(elid) + r'"[^>]*\bdata-start=")[0-9.]+(")')
    html, n = pat.subn(lambda m: m.group(1) + str(round(val, 3)) + m.group(2), html)
    assert n == 1, f'{elid}: matched {n}'
    return html

def main():
    src = open(SRC).read()
    starts = read_starts(src)
    tsrc = re.search(r'const T = (\{.*?\});', src, re.S).group(1)
    tbase = json.loads(re.sub(r'([A-Za-z_][A-Za-z0-9_]*)\s*:', r'"\1":', tsrc))
    # 시연 클립은 여럿이다 — id 를 소스에서 뽑아 쓴다(추가할 때 고칠 곳을 늘리지 않는다)
    video_ids = re.findall(r'<video[^>]*(?<![-\w])id="([^"]+)"', src)
    os.makedirs(OUTDIR, exist_ok=True)
    made = []
    for key, dur, clips, subs in CHAPTERS:
        s = src
        base = tbase[key]
        # 렌더러가 파킹(900초)된 비디오도 프레임 추출을 시도해 커버리지 게이트로
        # 렌더를 중단시키므로, 그 챕터에 속하지 않는 비디오는 태그 자체를 제거한다.
        for vid in video_ids:
            if vid in clips:
                continue
            s, n = re.subn(r'\s*<video[^>]*(?<![-\w])id="' + re.escape(vid) + r'"[^>]*></video>', '', s)
            assert n == 1, f'{key}: {vid} tag removal matched {n}'
        # 1) 챕터 상수 : 대상만 0, 나머지는 타임라인 밖으로
        newT = {k: (0 if k == key else 900) for k in tbase}
        s = re.sub(r'const T = \{.*?\};',
                   'const T = ' + json.dumps(newT).replace('"', '') + ';', s, flags=re.S)
        # 2판: 나레이션 시각표 N 도 챕터 기준으로 옮긴다(트윈이 N[id].at 을 쓴다)
        mN = re.search(r'const N = (\{.*?\});', s, flags=re.S)
        if mN:
            Nd = json.loads(mN.group(1))
            for k in Nd:
                v = Nd[k]['at'] - base
                # 음수 위치에 트윈을 넣으면 GSAP 이 타임라인 전체를 뒤로 민다 — 지나간 문장은 900초 뒤로 주차
                Nd[k]['at'] = round(v if v > -3 else 900 + v, 3)
            s = s.replace(mN.group(0), 'const N = ' + json.dumps(Nd) + ';')
        # 2) 클립 : 대상은 base 만큼 앞으로, 나머지는 900 으로
        for elid, st in starts.items():
            if elid == 'root':
                continue
            if elid in video_ids and elid not in clips:
                continue  # 태그를 제거했으므로 건너뜀
            m2 = re.fullmatch(r'subclip(\d+)', elid)
            if elid in clips or (m2 and int(m2.group(1)) in subs):
                s = set_start(s, elid, st - base)
            else:
                s = set_start(s, elid, 900)
        # 3) 자막 타임라인 배열도 같은 만큼 이동
        def shift_subs(m):
            rows = re.findall(r'\[(\d+), ([0-9.]+)\]', m.group(1))
            keep = [f'[{n}, {round(float(t) - base, 3)}]' for n, t in rows if int(n) in subs]
            return 'const SUBS = [' + ', '.join(keep) + '];'
        s = re.sub(r'const SUBS = \[(.*?)\];', shift_subs, s, flags=re.S)
        # 4) 루트 길이 · 컴포지션 id
        s, n = re.subn(r'(<div[^>]*(?<![-\w])id="root"[^>]*\bdata-duration=")[0-9.]+(")',
                       r'\g<1>' + str(dur) + r'\2', s)
        assert n == 1, f'{key}: root duration not rewritten'
        s = s.replace('data-composition-id="main"', f'data-composition-id="ch-{key}"')
        s = s.replace('window.__timelines["main"]', f'window.__timelines["ch-{key}"]')
        # 5) 글로우 반복 횟수를 챕터 길이에 맞춤(무한 반복 금지)
        s = re.sub(r'yoyo: true, repeat: \d+ \}, 0\);',
                   f'yoyo: true, repeat: {max(0, int(dur // 1.5) - 1)} }}, 0);', s)
        path = os.path.join(OUTDIR, f'{key}.html')
        open(path, 'w').write(s)
        made.append((key, dur, path))
    total = sum(d for _, d, _ in made)
    print(f'{len(made)} chapters, total {total:.1f}s')
    for k, d, p in made:
        print(f'  {k:6s} {d:5.1f}s  {os.path.relpath(p, ROOT)}')

if __name__ == '__main__':
    main()
