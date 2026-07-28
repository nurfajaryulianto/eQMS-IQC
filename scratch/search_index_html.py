import re
import os

html_path = os.path.join(os.path.dirname(__file__), '..', 'index.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

print('--- SEARCHING FOR TABLES IN ROOT INDEX.HTML ---')
tables = re.findall(r'<table[^>]*>([\s\S]*?)<\/table>', content, re.IGNORECASE)
print(f"Found {len(tables)} tables in root index.html")
for idx, table in enumerate(tables, 1):
    print(f"Table {idx}:")
    thead = re.search(r'<thead[^>]*>([\s\S]*?)<\/thead>', table, re.IGNORECASE)
    if thead:
        print("  Head:", thead.group(0).strip()[:100])
    tbody = re.search(r'<tbody[^>]*>', table, re.IGNORECASE)
    if tbody:
        print("  Tbody:", tbody.group(0).strip())
