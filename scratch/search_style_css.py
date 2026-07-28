import os

css_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'css', 'style.css')
with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print('--- SEARCHING STYLE.CSS FOR COLUMN HIDING ---')
in_media = False
for idx, line in enumerate(lines, 1):
    if '@media' in line:
        in_media = True
        print(f"Line {idx} (media start): {line.strip()}")
    if in_media and '}' in line:
        # check if matching closing brace
        pass
    if '.data-table' in line or 'th:' in line or 'td:' in line:
        print(f"Line {idx}: {line.strip()}")
