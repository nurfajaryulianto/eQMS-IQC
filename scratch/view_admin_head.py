import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- ADMIN.HTML HEAD ---')
for idx in range(25):
    if idx < len(lines):
        line = lines[idx]
        print(f"{idx+1}: {line.strip()}")
