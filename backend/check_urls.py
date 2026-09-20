import re
from pathlib import Path
import httpx

pages_dir = Path(r"d:\03_Study_Personal\Study\School\EXE_Of_Chau\frontend\pages")
found_urls = set()

for html_file in pages_dir.glob("*/index.html"):
    text = html_file.read_text(encoding="utf-8")
    urls = re.findall(r"https?://[^\s\"\'\)\>]+", text)
    for u in urls:
        # Strip trailing punctuation
        u = u.rstrip(".,;)")
        found_urls.add(u)

print(f"Checking {len(found_urls)} URLs...")
broken_urls = []
working_urls = []

client = httpx.Client(timeout=8.0, follow_redirects=True)
for u in sorted(found_urls):
    try:
        r = client.head(u)
        if r.status_code >= 400:
            # retry GET
            r = client.get(u)
        print(f"[{r.status_code}] {u[:80]}")
        if r.status_code >= 400:
            broken_urls.append((u, r.status_code))
        else:
            working_urls.append(u)
    except Exception as e:
        print(f"[ERR] {u[:80]} -> {e}")
        broken_urls.append((u, str(e)))

print("\n--- BROKEN URLS ---")
for u, status in broken_urls:
    print(f"Status: {status} -> {u}")
