import urllib.request
import urllib.error

url = "https://script.google.com/macros/s/AKfycbxPpUaDT-1xipllWqR4d-hrEDCK2AcR5d5oM7euWuTVIcSXyNXohz4dE5MK85WeIL8pRQ/exec?action=getMasterData&status=all"

req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        print("Status code:", response.status)
        print("Final URL:", response.geturl())
        content = response.read().decode('utf-8')
        print("Response first 300 chars:")
        print(content[:300])
except urllib.error.HTTPError as e:
    print("HTTPError code:", e.code)
    print("HTTPError url:", e.url)
    print("HTTPError body:", e.read().decode('utf-8')[:300])
except Exception as e:
    print("Error:", e)
