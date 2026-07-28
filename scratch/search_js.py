import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- PREVIEW-TABLE CONTEXT IN ADMIN.HTML ---')
for idx, line in enumerate(lines, 1):
    if 'preview-table' in line:
        print(f"Line {idx}: {line.strip()}")
        start = max(0, idx - 10)
        end = min(len(lines), idx + 10)
        for i in range(start, end):
            print(f"  {i+1}: {lines[i].strip()}")
        break
