import os

print('--- SEARCHING FOR RENDERMASTERTABLE IN WORKSPACE ---')
for root, dirs, files in os.walk('.'):
    # skip hidden dirs or node_modules
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith(('.js', '.html', '.gs')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            content = "".join(lines)
            if 'renderMasterTable' in content:
                print(f"Found in {path}")
                for idx, line in enumerate(lines, 1):
                    if 'renderMasterTable' in line:
                        print(f"  Line {idx}: {line.strip()}")
