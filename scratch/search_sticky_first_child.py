import os

print('--- SEARCHING FOR STICKY FIRST COLUMN IN WORKSPACE ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith(('.css', '.html', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if 'sticky' in content and ('first-child' in content or '1st-child' in content or 'nth-child(1)' in content or 'left:' in content):
                print(f"Found in {path}")
