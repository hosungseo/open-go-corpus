#!/usr/bin/env python3
"""이미 합성한 audio/voice/*.wav 를 narration.json 의 at 에 다시 배치해 audio/narration.wav 를 만든다(재합성 없이)."""
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOTAL = float(sys.argv[1]) if len(sys.argv) > 1 else 330.0
lines = json.load(open(os.path.join(ROOT, 'audio', 'narration.json')))
inputs, filters, labels = [], [], []
for i, ln in enumerate(lines):
    inputs += ['-i', os.path.join(ROOT, 'audio', 'voice', ln['id'] + '.wav')]
    ms = int(ln['at'] * 1000); filters.append(f'[{i}:a]adelay={ms}|{ms}[d{i}]'); labels.append(f'[d{i}]')
fc = ';'.join(filters) + ';' + ''.join(labels) + f'amix=inputs={len(lines)}:normalize=0:dropout_transition=0[m];[m]apad=whole_dur={TOTAL},atrim=0:{TOTAL},dynaudnorm=p=0.9:m=4,volume=1.25,alimiter=limit=0.89:level=disabled[out]'
out = os.path.join(ROOT, 'audio', 'narration.wav')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + inputs + ['-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-ac', '1', out], check=True)
print('narration.wav', TOTAL, 's,', len(lines), 'lines')
