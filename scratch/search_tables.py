import re
import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- ALL TABLE OPENING TAGS ---')
opening_tags = re.findall(r'<table[^>]*>', content, re.IGNORECASE)
for tag in opening_tags:
    print(tag)
