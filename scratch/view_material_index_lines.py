import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'index.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- MATERIAL/INDEX.HTML LINES 480 to 520 ---')
for idx in range(479, 520):
    if idx < len(lines):
        line = lines[idx]
        print(f"{idx+1}: {line.strip()}")
