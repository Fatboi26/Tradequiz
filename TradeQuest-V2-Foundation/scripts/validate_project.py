#!/usr/bin/env python3
"""Fast deployment checks for TradeQuest. Uses only Python's standard library."""
from __future__ import annotations
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

for required in ('index.html','student.html','teacher.html','config/branding.json','questions/index.json'):
    if not (ROOT / required).is_file(): errors.append(f'Missing required file: {required}')

for path in ROOT.rglob('*.json'):
    try: json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc: errors.append(f'Invalid JSON {path.relative_to(ROOT)}: {exc}')

for html in ROOT.glob('*.html'):
    text = html.read_text(encoding='utf-8')
    for ref in re.findall(r'(?:src|href)=["\']([^"\']+)', text):
        if ref.startswith(('#','http:','https:','mailto:','data:')): continue
        clean = ref.split('?',1)[0].split('#',1)[0]
        if clean and not (ROOT / clean).exists(): errors.append(f'{html.name}: missing reference {clean}')

for js in ROOT.rglob('*.js'):
    text = js.read_text(encoding='utf-8')
    for ref in re.findall(r"(?:from\s+|import\s*)['\"](\.{1,2}/[^'\"]+)['\"]", text):
        target = (js.parent / ref).resolve()
        if not target.exists(): errors.append(f'{js.relative_to(ROOT)}: missing import {ref}')

registry = json.loads((ROOT/'questions/index.json').read_text(encoding='utf-8'))
for subject in registry.get('subjects',[]):
    file = subject.get('file','')
    if file and not (ROOT/file).is_file(): errors.append(f'questions/index.json: missing {file}')

if errors:
    print('TradeQuest validation failed:')
    for error in errors: print(f' - {error}')
    sys.exit(1)
print('TradeQuest validation passed.')
