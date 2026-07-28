import os
import re

js_path = os.path.join(os.path.dirname(__file__), '..', 'js', 'material', 'admin.js')
with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- FUNCTIONS IN ADMIN.JS ---')
funcs = re.findall(r'(?:function\s+(\w+)|(\w+)\s*=\s*function|window\.(\w+)\s*=\s*(?:async\s*)?function)', content)
for idx, f in enumerate(funcs, 1):
    # filter non-empty
    name = next(n for n in f if n)
    print(f"Function {idx}: {name}")
