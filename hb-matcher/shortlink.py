#!/usr/bin/env python3
"""
GitHub Pages 短網址產生器
用法: python3 shortlink.py <html_file> [short_name] [label]
範例: python3 shortlink.py hb-gushan-1500-1650.html gushan1500 "鼓山區精選物件"
"""

import sys
import json
import os
import re
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GO_DIR = os.path.join(BASE_DIR, "go")
DATA_DIR = os.path.join(BASE_DIR, "data")
SHORTLINKS_FILE = os.path.join(DATA_DIR, "shortlinks.json")
BASE_URL = "https://findingsweethome860149-coder.github.io/buyer-match"
PAGES_URL = "https://findingsweethome860149-coder.github.io"

REDIRECT_TEMPLATE = """\
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="0; url={target}">
<title>正在跳轉...</title>
<style>
body {{ font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f7f3ed; color: #3d6b4f; }}
.msg {{ text-align: center; }}
</style>
</head>
<body>
<div class="msg">
  <p>正在為您跳轉物件頁面...</p>
  <p><a href="{target}">點此直接開啟</a></p>
</div>
<script>window.location.replace("{target}");</script>
</body>
</html>
"""

def load_shortlinks():
    if os.path.exists(SHORTLINKS_FILE):
        with open(SHORTLINKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_shortlinks(links):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SHORTLINKS_FILE, "w", encoding="utf-8") as f:
        json.dump(links, f, ensure_ascii=False, indent=2)

def slugify(name):
    """Convert filename to slug: hb-gushan-1500-1650.html → gushan1500"""
    name = os.path.basename(name).replace(".html", "")
    # Remove common prefixes
    name = re.sub(r"^(hb-|buyer-match-|match-report-)", "", name)
    # Keep only alphanumeric, hyphens
    name = re.sub(r"[^a-zA-Z0-9一-鿿-]", "", name)
    return name

def unique_slug(slug, existing_shorts):
    if slug not in existing_shorts:
        return slug
    i = 2
    while f"{slug}-{i}" in existing_shorts:
        i += 1
    return f"{slug}-{i}"

def create_shortlink(html_filename, short_name=None, label=""):
    """
    Create a short URL redirect for html_filename.
    Returns the short URL.
    """
    links = load_shortlinks()
    existing_shorts = {l["short"] for l in links}

    # Determine target path (relative to GitHub Pages root)
    target = f"/buyer-match/{os.path.basename(html_filename)}"

    # Check if target already has a short link
    for link in links:
        if link["target"] == target:
            short_url = f"{PAGES_URL}/go/{link['short']}"
            print(f"已存在短網址: {short_url}")
            return short_url

    # Generate slug
    if not short_name:
        short_name = slugify(html_filename)
    short_name = unique_slug(short_name, existing_shorts)

    # Create redirect HTML
    go_path = os.path.join(GO_DIR, short_name)
    os.makedirs(go_path, exist_ok=True)
    redirect_html = REDIRECT_TEMPLATE.format(target=target)
    with open(os.path.join(go_path, "index.html"), "w", encoding="utf-8") as f:
        f.write(redirect_html)

    # Update shortlinks.json
    links.append({
        "short": short_name,
        "target": target,
        "label": label or os.path.basename(html_filename),
        "created": str(date.today())
    })
    save_shortlinks(links)

    short_url = f"{PAGES_URL}/go/{short_name}"
    print(f"短網址已建立: {short_url}")
    print(f"  → 目標: {PAGES_URL}{target}")
    return short_url

def list_shortlinks():
    links = load_shortlinks()
    if not links:
        print("尚無短網址")
        return
    print(f"{'短網址':<20} {'目標':<50} {'建立日期'}")
    print("-" * 90)
    for l in links:
        print(f"{PAGES_URL}/go/{l['short']:<15} {PAGES_URL}{l['target']:<50} {l.get('created','')}")

def delete_shortlink(short_name):
    links = load_shortlinks()
    new_links = [l for l in links if l["short"] != short_name]
    if len(new_links) == len(links):
        print(f"找不到短網址: {short_name}")
        return
    save_shortlinks(new_links)
    go_path = os.path.join(GO_DIR, short_name)
    if os.path.exists(go_path):
        import shutil
        shutil.rmtree(go_path)
    print(f"已刪除短網址: {short_name}")

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "list":
        list_shortlinks()
    elif args[0] == "delete" and len(args) >= 2:
        delete_shortlink(args[1])
    elif args[0].endswith(".html"):
        html_file = args[0]
        short = args[1] if len(args) > 1 else None
        label = args[2] if len(args) > 2 else ""
        create_shortlink(html_file, short, label)
    else:
        print(__doc__)
