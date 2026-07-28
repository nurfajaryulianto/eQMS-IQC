import os

print('--- SEARCHING FOR MASTER-TBODY IN ROOT FILES ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root or 'material' in root:
        continue
    for file in files:
        if file.endswith(('.js', '.html')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if 'master-tbody' in content or 'renderMasterTable' in content:
                print(f"Found in {path}")
