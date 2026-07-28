import os
import re

print('--- SEARCHING FOR DATA-TABLE TH OR TD HIDING IN CSS ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith('.css'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if '.data-table' in content:
                # search for th:nth-child, td:nth-child, display:none, or th:not, td:not
                for word in ['none', 'hidden', 'nth-child', 'not']:
                    if word in content:
                        print(f"File {path} has keyword '{word}' and '.data-table'")
                        # find matching blocks
                        matches = re.findall(r'[^\n]*' + word + r'[^\n]*', content)
                        for m in matches[:5]:
                            print(f"  {m.strip()}")
