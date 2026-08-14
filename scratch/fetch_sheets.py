import urllib.request
import json
import csv
import io

SPREADSHEET_ID = "1KLVddUlNGySE149gH9UD33DOjJMMCzcKHkvB0gZnqIc"

# Test exporting sheet by gid or by sheet name via gviz
urls_to_try = [
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid=1201077179",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid=0",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Inspection_Sessions",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Defect_Breakdown",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet2",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Inspection",
    f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Defect",
]

for url in urls_to_try:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read().decode('utf-8')
            lines = content.strip().split('\n')
            print(f"URL: {url}")
            print(f"Status 200, Lines: {len(lines)}")
            print(f"First 2 lines: {lines[:2]}\n")
    except Exception as e:
        print(f"URL: {url} -> Failed: {e}\n")
