#!/usr/bin/env python3
"""probe.json の責任表示に出てくる人名を authors.json / translators.json と突き合わせる。

使い方: python3 scripts/find_people.py <probe.json>
        python3 scripts/find_people.py --names 結城浩 まつもとゆきひろ

OK候補ごとに「著」「訳」の人名を切り出し、既存エンティティにあれば id を、なければ `?` を出す。
既存IDを引くためだけに authors.json 全件をコンテキストに載せるのを避けるための補助。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "data" / "source"


def norm(s: str) -> str:
    return re.sub(r"[\s　・･,，.。]", "", unicodedata.normalize("NFKC", s or "")).lower()


def load(name):
    d = json.loads((SRC / name).read_text(encoding="utf-8"))
    return {norm(x["name"]): x["id"] for x in d}


def split_resp(resp: str):
    """「結城浩 著」「Brian W. Kernighan 著, 木村泉 訳」を [(名前, 役割), …] に割る。"""
    out = []
    for chunk in re.split(r"[,，;；]", resp or ""):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^(.*?)[\s　]*(著|共著|編著|編|監修|訳|共訳|監訳|翻訳)\s*$", chunk)
        if m:
            out.append((m.group(1).strip(), m.group(2)))
        else:
            out.append((chunk, "?"))
    return out


def main():
    authors = load("authors.json")
    translators = load("translators.json")

    if sys.argv[1:2] == ["--names"]:
        for nm in sys.argv[2:]:
            k = norm(nm)
            print(f"{nm}\ta={authors.get(k, '?')}\ttr={translators.get(k, '?')}")
        return

    probe = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    for r in probe:
        if r.get("status") != "OK":
            continue
        parts = []
        for name, role in split_resp(r.get("resp", "")):
            table = translators if role in ("訳", "共訳", "監訳", "翻訳") else authors
            parts.append(f"{name}[{role}]={table.get(norm(name), '?')}")
        print(f"{r['n']}\t" + " ".join(parts))


if __name__ == "__main__":
    main()
