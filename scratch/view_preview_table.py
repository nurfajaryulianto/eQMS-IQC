import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- RENDERPREVIEWTABLE IN ADMIN.JS ---')
start_line = 0
for idx, line in enumerate(lines):
    if 'function renderPreviewTable' in line:
        start_line = idx
        break

for i in range(start_line, start_line + 40):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}", end="")
