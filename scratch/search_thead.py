import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- SEARCHING FOR THEAD/TH/TR/TABLE WRITES IN ADMIN.JS ---')
for idx, line in enumerate(lines, 1):
    lower = line.lower()
    if 'thead' in lower or '<th>' in lower or '<tr' in lower or 'table' in lower:
        # print if it sets innerHTML or manipulates elements
        if 'innerhtml' in lower or 'document.' in lower or 'append' in lower:
            print(f"Line {idx}: {line.strip()}")
