import os

tailwind_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'css', 'tailwind.css')
if os.path.exists(tailwind_path):
    with open(tailwind_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    print("tailwind.css exists, size:", len(content))
    # search for data-table
    import re
    matches = re.findall(r'[^\n]*data-table[^\n]*', content)
    print("Found data-table matches in tailwind.css:", len(matches))
    for m in matches[:10]:
        print("  ", m[:150])
else:
    print("tailwind.css does NOT exist!")
