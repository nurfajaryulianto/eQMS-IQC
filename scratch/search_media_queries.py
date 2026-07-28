import re
import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- MEDIA QUERIES IN ADMIN.HTML ---')
queries = re.findall(r'@media[^{]*\{([\s\S]*?)\}', content, re.IGNORECASE)
for idx, q in enumerate(queries, 1):
    print(f"Query {idx}:")
    print(q[:500].strip())
