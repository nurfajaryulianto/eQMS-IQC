import os
import re

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# find div with id="panel-passall"
panel_passall = re.search(r'<div[^>]*id="panel-passall"([\s\S]*?)<\/div>\s*<!-- \/panel-passall -->', content, re.IGNORECASE)
if not panel_passall:
    # try matching without comment
    panel_passall = re.search(r'<div[^>]*id="panel-passall"([\s\S]*?)<\/div>\s*<div', content, re.IGNORECASE)

if panel_passall:
    print('--- PANEL-PASSALL HTML (First 4000 chars) ---')
    print(panel_passall.group(1)[:4000])
else:
    print("Could not find panel-passall div")
