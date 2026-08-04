import re

filepath = r"c:\Users\fajar.yulianto\Documents\ISENG\eQMS-main\eQMS-IQC\gas\CodeMaterial.gs"
with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    m = re.match(r'^\s*function\s+([a-zA-Z0-9_$]+)', line)
    if m:
        print(f"Line {i:4d}: {m.group(1)}")
