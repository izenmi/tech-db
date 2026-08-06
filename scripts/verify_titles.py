#!/usr/bin/env python3
"""登録済みworkのISBNを楽天ブックスに直引きして、書名・版のズレを洗い出す。

使い方:
  RAKUTEN_APP_ID=... RAKUTEN_ACCESS_KEY=... python3 scripts/verify_titles.py [work-id ...]

NDLのタイトル検索は「スッキリわかるJava入門」で実践編を拾うような取り違えを起こすことがある。
ISBNからの直引きなら誤マッチが原理的に起きないので、バッチ反映のあとにこれを通して確認する。
引数を省略すると全workを検査する。差分があったものだけを出力する。
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "public" / "data" / "source"
# 2026年のインフラ刷新で app.rakuten.co.jp から openapi.rakuten.co.jp に移り、
# Referer/Origin ヘッダが必須になった。どちらか欠けると 403 HTTP_REFERRER_MISSING が返る。
ENDPOINT = "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404"
REFERER = "https://izenmi.github.io/tech-db/"
ORIGIN = "https://izenmi.github.io"

APP_ID = os.environ.get("RAKUTEN_APP_ID")
ACCESS_KEY = os.environ.get("RAKUTEN_ACCESS_KEY")


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"[\s　・,，.。!！?？'\"“”‘’()（）\[\]「」『』【】/／~〜\-—–_+:：]", "", s).lower()


def lookup(isbn):
    params = {"applicationId": APP_ID, "accessKey": ACCESS_KEY, "isbn": isbn}
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "Referer": REFERER, "Origin": ORIGIN, "User-Agent": "tech-db-verify/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            items = json.load(r).get("Items", [])
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    if not items:
        return None
    it = items[0]["Item"]
    return {"title": it.get("title", ""), "author": it.get("author", ""),
            "publisher": it.get("publisherName", ""), "salesDate": it.get("salesDate", "")}


def main():
    if not (APP_ID and ACCESS_KEY):
        print("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が未設定です")
        sys.exit(1)
    works = json.loads((SRC / "works.json").read_text(encoding="utf-8"))
    wanted = set(sys.argv[1:])
    targets = [w for w in works if w.get("isbn") and (not wanted or w["id"] in wanted)]

    flagged = 0
    for w in targets:
        info = lookup(w["isbn"])
        time.sleep(0.5)
        if info is None:
            print(f"[not-found] {w['id']} ISBN {w['isbn']}")
            flagged += 1
            continue
        if "error" in info:
            print(f"[{info['error']}] {w['id']} ISBN {w['isbn']}")
            flagged += 1
            continue
        rt = norm(info["title"])
        ours = norm(w["title"])
        edition_ok = (not w.get("edition")) or norm(w["edition"]) in rt
        if ours not in rt or not edition_ok:
            print(f"[diff] {w['id']}\n   ours: {w['title']} / {w.get('edition','-')}"
                  f"\n   rakuten: {info['title']} / {info['publisher']} / {info['salesDate']}")
            flagged += 1
    print(f"-- 検査 {len(targets)}件、要確認 {flagged}件")


if __name__ == "__main__":
    main()
