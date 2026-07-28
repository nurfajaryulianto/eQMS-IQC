import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- SEARCHING JS FOR THEAD OR TH ---')
for idx, line in enumerate(lines, 1):
    lower = line.lower()
    if 'thead' in lower or 'th>' in lower:
        print(f"Line {idx}: {line.strip()}")
