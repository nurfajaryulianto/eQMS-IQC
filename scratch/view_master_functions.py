import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- OCCURRENCES OF ALLMASTERDATA OR RENDERMASTERTABLE IN ADMIN.JS ---')
for idx, line in enumerate(lines, 1):
    lower = line.lower()
    if 'allmasterdata' in lower or 'rendermastertable' in lower:
        print(f"Line {idx}: {line.encode('ascii', errors='replace').decode('ascii').strip()}")
