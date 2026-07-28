import re
import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- CONTENT OF STYLE TAGS IN ADMIN.HTML ---')
styles = re.findall(r'<style>([\s\S]*?)<\/style>', content, re.IGNORECASE)
for idx, s in enumerate(styles, 1):
    print(f"Style tag {idx}:")
    print(s.encode('ascii', errors='replace').decode('ascii'))
