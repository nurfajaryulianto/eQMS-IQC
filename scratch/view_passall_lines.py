import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

start_idx = -1
for idx, line in enumerate(lines):
    if 'id="panel-passall"' in line:
        start_idx = idx
        break

if start_idx != -1:
    print(f"--- ADMIN.HTML PANEL-PASSALL LINES {start_idx+1} to {start_idx+100} ---")
    for idx in range(start_idx, start_idx + 100):
        if idx < len(lines):
            print(f"{idx+1}: {lines[idx].strip()}")
else:
    print("Could not find panel-passall")
