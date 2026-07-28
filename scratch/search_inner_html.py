import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- INNERHTML IN ADMIN.JS ---')
for idx, line in enumerate(lines, 1):
    if 'innerhtml' in line.lower():
        print(f"Line {idx}: {line.strip()}")
