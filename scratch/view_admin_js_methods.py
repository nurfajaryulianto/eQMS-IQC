import os
import re

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- DOM MANIPULATIONS IN ADMIN.JS ---')
for idx, line in enumerate(lines, 1):
    lower = line.lower()
    if '.innerhtml' in lower or '.textcontent' in lower or 'document.getelementbyid' in lower or 'document.queryselector' in lower:
        print(f"Line {idx}: {line.strip()}")
