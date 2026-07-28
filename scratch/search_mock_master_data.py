import os

print('--- SEARCHING FOR MOCK_MASTER_DATA ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith('.js'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if 'MOCK_MASTER_DATA' in content:
                print(f"Found in {path}")
                # find definition line
                lines = content.splitlines()
                for idx, line in enumerate(lines, 1):
                    if 'MOCK_MASTER_DATA' in line and '=' in line:
                        print(f"  Line {idx}: {line[:120]}")
