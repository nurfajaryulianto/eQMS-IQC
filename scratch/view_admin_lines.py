import os

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- ADMIN.JS LINES 90 to 150 ---')
for idx in range(90, 150):
    if idx < len(lines):
        line = lines[idx]
        print(f"{idx+1}: {line.encode('ascii', errors='replace').decode('ascii')}", end="")
