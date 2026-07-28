import os
import re

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- SEARCHING FOR SCRIPT TAGS IN ADMIN.HTML ---')
scripts = re.findall(r'<script[^>]*>([\s\S]*?)<\/script>', content, re.IGNORECASE)
for idx, s in enumerate(scripts, 1):
    print(f"Script {idx}:")
    print(s.strip()[:200])
    print("...")
