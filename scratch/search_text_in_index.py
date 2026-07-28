import os

print('--- SEARCHING FOR TEXT "Daftar PO" OR "Master Data" IN ALL HTML FILES ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith('.html'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if 'Daftar PO' in content or 'Master Data' in content:
                print(f"Found in {path}")
