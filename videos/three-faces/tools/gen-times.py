#!/usr/bin/env python3
"""나레이션 실측(음성 파일 길이)으로 시각표를 만들고 index.html 과 split-chapters.py 에 새긴다.

  1) audio/narration.json 의 계획 at 을 실제 길이에 맞춰 다시 배치(넘치면 뒤로 밀고, 숨은 유지)
  2) 챕터 시작 = 그 챕터 첫 문장의 at 에서 lead 만큼 앞 (조문 카드 등 준비 시간)
  3) index.html:  const T / const N / root data-duration / [data-ch] 클립 / [data-sub] 자막 / video data-from
  4) tools/split-chapters.py 의 CHAPTERS 표

  실행:  python3 tools/gen-times.py         (make-narration.py 가 audio/voice/*.wav 를 만든 뒤)
"""
import json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(ROOT, *p)
GAP = 0.55

# 챕터 → 첫 문장, 시작 여유(초)
CHAPS = [("open", "n00", 0.8), ("concl", "n02", 0.4), ("cmp", "n04", 0.5), ("ents", "n07", 0.4),
         ("rnA", "n08", 0.3), ("rnB", "n10", 0.4), ("rnC", "n13", 0.4),
         ("pvA", "n15", 0.3), ("pvB", "n17", 0.4), ("pvC", "n18", 0.4),
         ("ogA", "n20", 0.3), ("ogB", "n22", 0.4), ("ogC", "n24", 0.4),
         ("same", "n26", 0.4), ("comp", "n28", 0.4), ("close", "n31", 0.4)]
THANKS = 7.0
SUBDUR = {"default": 6.0}

def wavdur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip())

lines = json.load(open(J("audio", "narration.json")))
prev_end, delay = 0.0, 0.0
N = {}
for ln in lines:
    d = wavdur(J("audio", "voice", ln["id"] + ".wav"))
    at = max(ln["at"] + delay, prev_end + GAP)
    delay = at - ln["at"]
    ln["at"] = round(at, 2)
    N[ln["id"]] = {"at": round(at, 2), "dur": round(d, 2)}
    prev_end = at + d
json.dump(lines, open(J("audio", "narration.json"), "w"), ensure_ascii=False, indent=1)

T = {}
for i, (key, first, lead) in enumerate(CHAPS):
    T[key] = 0.0 if key == "open" else round(N[first]["at"] - lead, 1)
last = lines[-1]["id"]
T["thanks"] = round(N[last]["at"] + N[last]["dur"] + 1.4, 1)
END = round(T["thanks"] + THANKS, 1)
keys = [k for k, _, _ in CHAPS] + ["thanks"]
DUR = {k: round((T[keys[i + 1]] if i + 1 < len(keys) else END) - T[k], 1) for i, k in enumerate(keys)}

html = open(J("index.html")).read()
html = re.sub(r"const T = \{.*?\};", "const T = " + json.dumps(T).replace('"', "") + ";", html, count=1, flags=re.S)
html = re.sub(r"const N = \{.*?\};", "const N = " + json.dumps(N) + ";", html, count=1, flags=re.S)
html, n = re.subn(r'(<div[^>]*id="root"[^>]*\bdata-duration=")[0-9.]+(")', r"\g<1>%s\2" % END, html); assert n == 1

def set_attrs(tag_re, start, dur):
    def f(m):
        s = m.group(0)
        s = re.sub(r'data-start="[0-9.]+"', 'data-start="%s"' % start, s)
        s = re.sub(r'data-duration="[0-9.]+"', 'data-duration="%s"' % dur, s)
        return s
    return f

for key in keys:
    # 섹션 클립
    html, n = re.subn(r'<section[^>]*data-ch="%s"[^>]*>' % key, set_attrs(None, T[key], DUR[key]), html)
    assert n == 1, key
# 비디오: 챕터 안에서 data-from 문장부터 챕터 끝까지
for m in list(re.finditer(r'<video[^>]*data-ch="([a-z]+)"[^>]*data-from="(n\d+)"[^>]*>', html)):
    key, frm = m.group(1), m.group(2)
    until = re.search(r'data-until="(n\d+)"', m.group(0))
    start = round(N[frm]["at"] - 0.2, 1)
    dur = round((N[until.group(1)]["at"] - 0.5 if until else T[key] + DUR[key]) - start, 1)
    html = html.replace(m.group(0), set_attrs(None, start, dur)(m))
# 자막: 그 문장 길이만큼(최대 SUBDUR)
subs = []
for m in list(re.finditer(r'<section id="subclip(\d+)"[^>]*data-sub="(n\d+)"[^>]*>', html)):
    no, frm = int(m.group(1)), m.group(2)
    start = round(N[frm]["at"] + 0.3, 1); dur = round(min(N[frm]["dur"] + 0.8, 9.0), 1)
    html = html.replace(m.group(0), set_attrs(None, start, dur)(m)); subs.append((no, start, dur))
open(J("index.html"), "w").write(html)

# split-chapters CHAPTERS
def clips_of(key):
    ids = ["stage-" + key]
    if key == "same": ids.append("gapvid")
    if key == "comp": ids.append("openvid")
    return ids
rows = []
for k in keys:
    s = [no for no, st, du in subs if T[k] <= st < T[k] + DUR[k]]
    rows.append("    (%r, %s, %s, %s)," % (k, DUR[k], clips_of(k), s))
sp = open(J("tools", "split-chapters.py")).read()
sp = re.sub(r"CHAPTERS = \[.*?\n\]\n", "CHAPTERS = [\n" + "\n".join(rows) + "\n]\n", sp, count=1, flags=re.S)
open(J("tools", "split-chapters.py"), "w").write(sp)

print("총 %.1f초 · 챕터 %d" % (END, len(keys)))
for k in keys:
    flag = "  <-- 46초 초과" if DUR[k] >= 46 else ""
    print("  %-6s %6.1f  +%5.1f%s" % (k, T[k], DUR[k], flag))
print("자막", len(subs), "· 나레이션", len(lines), "줄, 마지막 끝", round(prev_end, 1))
