import os
import re

css_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'css', 'dashboard.css')
if os.path.exists(css_path):
    with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    print('--- TARGETING RULES FOR DATA-TABLE IN DASHBOARD.CSS ---')
    # Find all occurrences of data-table and print context
    for match in re.finditer(r'[^\n]*data-table[^\n]*', content):
        print(match.group(0).strip())
else:
    print("dashboard.css not found")
