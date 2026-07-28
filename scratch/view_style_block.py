import os
import re

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

style_block = re.search(r'<style[^>]*>([\s\S]*?)<\/style>', content, re.IGNORECASE)
if style_block:
    print('--- STYLE BLOCK OF ADMIN.HTML ---')
    print(style_block.group(1).encode('ascii', errors='replace').decode('ascii'))
else:
    print("No style block found")
