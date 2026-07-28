import os

print('--- SEARCHING FOR TABLES IN ALL HTML FILES ---')
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '.gemini' in root:
        continue
    for file in files:
        if file.endswith('.html'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            # print all table tags and headers
            import re
            tables = re.findall(r'<table[^>]*>([\s\S]*?)<\/table>', content, re.IGNORECASE)
            for idx, t in enumerate(tables, 1):
                headers = re.findall(r'<th[^>]*>([\s\S]*?)<\/th>', t, re.IGNORECASE)
                tbodys = re.findall(r'<tbody[^>]*id="([^"]*)"', t, re.IGNORECASE)
                print(f"{path} Table {idx}: tbodys={tbodys}, headers={[h.strip() for h in headers[:10]]}")
