import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'index.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- OCCURRENCES OF "Daftar PO" OR "Master Data" IN MATERIAL/INDEX.HTML ---')
for idx, line in enumerate(lines, 1):
    if 'daftar po' in line.lower() or 'master data' in line.lower():
        print(f"Line {idx}: {line.strip()}")
