import os
import re

html_path = os.path.join(os.path.dirname(__file__), '..', 'material', 'admin.html')
with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Extract style block
style_block = re.search(r'<style[^>]*>([\s\S]*?)<\/style>', content, re.IGNORECASE)
if style_block:
    css = style_block.group(1)
    print('--- SEARCHING INLINE CSS IN ADMIN.HTML ---')
    # Find all rules mentioning data-table
    rules = re.findall(r'([^\}]*data-table[^\}]*\{[^\}]*\})', css)
    for idx, rule in enumerate(rules, 1):
        print(f"Rule {idx}:")
        print(rule.strip())
        print()
else:
    print("No style block found in admin.html")
