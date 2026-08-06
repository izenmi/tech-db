#!/usr/bin/env python3
"""probe.py の下調べ結果と手書きの注釈を合成して apply_batch.py 用の batch.json を作る。

使い方: python3 scripts/merge_batch.py <probe.json> <annot.json> <batch.json>

annot.json の形式(キーを短くしてあるのは手書き量を減らすため):
{
  "newAuthors":     [{"id":..,"name":..,"kana":..,"desc":..,"birth":1970?}],
  "newTranslators": [同上],
  "newPublishers":  [{"id":..,"name":..,"kana":..,"desc":..,"founded":1960?}],
  "newTechs":       [{"id":..,"name":..,"kana":..,"cat":"language","desc":..,"released":1995?}],
  "works": [
    {"n": 2,                     # probe.json の n(候補の行番号)
     "id": "programmers-brain",
     "a":  ["felienne-hermans"], # authorIds
     "tr": ["mizuno-takaaki"],   # translatorIds(翻訳書のみ)
     "p":  "shuwa-system",       # publisherId。省略時はNDLの出版社名から自動解決
     "t":  ["python"],           # techIds(空可)
     "lv": "intermediate",       # level
     "th": ["essay-career"],     # themeIds
     "o":  "ov",                 # origin: "jp" | "ov"
     "ot": "The Programmer's Brain",  # 翻訳書の原題(NDLが持っていれば省略可)
     "fy": 2021,                 # firstPublishedYear。翻訳書は原著初版年で必須。jpは省略時NDLの最古年
     "ed": "第2版",              # edition(任意)
     "tv": "Python 3.11",        # targetVersion(任意)
     "title": "…",               # NDLの書名を使わず上書きしたいときだけ
     "syn": "…"}                 # 150〜250字のあらすじ(自分の言葉で)
  ]
}

タイトル・書名の読み・ISBN・出版年・出版社・原題・sourceNote は probe.json から機械的に埋める。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "data" / "source"
TODAY = "2026-08-06"

EDITION_IN_TITLE = re.compile(r"(第\s*\d+\s*版|改訂新版|改訂第\d+版|改訂版|新版|増補改訂版|増補版|完全版)")


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def title_kana(raw: str) -> str:
    """NDLの titleTranscription(カタカナ・副題つき)をサイトの表記(ひらがな・副題なし)に直す。"""
    s = raw.split(" : ")[0].split("：")[0]
    s = kata_to_hira(unicodedata.normalize("NFKC", s))
    return re.sub(r"[\s　]", "", s).lower()


def short_title(raw: str) -> str:
    return raw.split(" : ")[0].strip()


def norm_name(s: str) -> str:
    return re.sub(r"[\s　・]", "", unicodedata.normalize("NFKC", s or "")).lower()


def loose_name(s: str) -> str:
    """「日経BP社」と「日経BP」、「オーム社(発売)」と「オーム社」のような表記ゆれを吸収する。"""
    s = norm_name(s)
    s = re.sub(r"[(（].*?[)）]", "", s)
    return re.sub(r"(株式会社|出版社|社)$", "", s)


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    probe = {r["n"]: r for r in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))}
    annot = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    out_path = Path(sys.argv[3])

    publishers = json.loads((SRC / "publishers.json").read_text(encoding="utf-8"))
    pub_by_name = {norm_name(p["name"]): p["id"] for p in publishers}
    pub_by_loose = {loose_name(p["name"]): p["id"] for p in publishers}

    def resolve_publisher(name):
        return pub_by_name.get(norm_name(name)) or pub_by_loose.get(loose_name(name))

    def person(x):
        d = {"id": x["id"], "name": x["name"], "nameKana": x["kana"],
             "description": x["desc"], "externalLinks": {},
             "sourceNote": x.get("note", "国立国会図書館サーチAPIの書誌(責任表示)で確認。"),
             "updatedAt": TODAY}
        if x.get("birth"):
            d["birthYear"] = x["birth"]
        return d

    batch = {"newAuthors": [], "newTranslators": [], "newPublishers": [],
             "newTechs": [], "newThemes": [], "newAwards": [], "works": []}

    for x in annot.get("newAuthors", []):
        batch["newAuthors"].append(person(x))
    for x in annot.get("newTranslators", []):
        batch["newTranslators"].append(person(x))
    for x in annot.get("newPublishers", []):
        d = {"id": x["id"], "name": x["name"], "nameKana": x["kana"],
             "description": x["desc"], "externalLinks": {},
             "sourceNote": x.get("note", "国立国会図書館サーチAPIの書誌(出版社名)で確認。"),
             "updatedAt": TODAY}
        if x.get("founded"):
            d["foundedYear"] = x["founded"]
        if x.get("parent"):
            d["parentCompany"] = x["parent"]
        batch["newPublishers"].append(d)
        pub_by_name[norm_name(x["name"])] = x["id"]
        pub_by_loose.setdefault(loose_name(x["name"]), x["id"])
    for x in annot.get("newTechs", []):
        d = {"id": x["id"], "name": x["name"], "nameKana": x["kana"], "category": x["cat"],
             "description": x["desc"], "externalLinks": {},
             "sourceNote": x.get("note", "公式サイトおよび一般に流通している技術書の記述で確認。"),
             "updatedAt": TODAY}
        if x.get("released"):
            d["releasedYear"] = x["released"]
        batch["newTechs"].append(d)
    for x in annot.get("newThemes", []):
        batch["newThemes"].append(x)
    for x in annot.get("newAwards", []):
        batch["newAwards"].append(x)

    problems = []
    for a in annot.get("works", []):
        p = probe.get(a["n"])
        if p is None or p.get("status") != "OK":
            problems.append(f"n={a['n']} ({a.get('id')}): probeにOKの結果がない")
            continue

        overseas = a.get("o") == "ov"
        pid = a.get("p") or resolve_publisher(p.get("publisher", ""))
        if not pid:
            problems.append(f"n={a['n']} ({a['id']}): 出版社 {p.get('publisher')!r} を解決できない")
            continue

        title = a.get("title") or short_title(p["title"])
        year = p.get("year")
        first = a.get("fy") or (p.get("first_year") if not overseas else None)
        if not first:
            problems.append(f"n={a['n']} ({a['id']}): 翻訳書は原著初版年 fy が必須")
            continue

        w = {
            "id": a["id"],
            "title": title,
            "titleKana": a.get("kana") or title_kana(p.get("kana") or ""),
            "authorIds": a.get("a", []),
            "techIds": a.get("t", []),
            "translatorIds": a.get("tr", []) if overseas else [],
            "publisherId": pid,
            "themeIds": a.get("th", []),
            "origin": "overseas" if overseas else "jp",
            "level": a.get("lv"),
            "firstPublishedYear": first,
            "synopsis": a.get("syn", ""),
            "externalLinks": {},
            "updatedAt": TODAY,
        }
        if p.get("isbn"):
            w["isbn"] = p["isbn"]

        edition = a.get("ed")
        if edition is None:
            m = EDITION_IN_TITLE.search(p["title"])
            edition = m.group(1) if m else None
        if edition:
            w["edition"] = edition
        if year:
            w["latestEditionYear"] = year
        if a.get("tv"):
            w["targetVersion"] = a["tv"]
        if a.get("series"):
            w["seriesName"] = a["series"]
        if overseas:
            w["jpPublishedYear"] = year
            ot = a.get("ot") or p.get("originalTitle")
            if not ot:
                problems.append(f"n={a['n']} ({a['id']}): 翻訳書の原題 ot が必要")
                continue
            w["originalTitle"] = ot
        if a.get("awards"):
            w["awardResults"] = a["awards"]

        note = (f"邦訳版の書誌" if overseas else "書誌")
        note += (f"({p.get('publisher')}、{year}年"
                 + (f"、ISBN {p['isbn']}" if p.get("isbn") else "") + ")"
                 "は国立国会図書館サーチAPI(opensearch)の検索結果で確認。")
        if p.get("resp"):
            note += f"著者・訳者は同APIの責任表示「{p['resp']}」による。"
        if not overseas and p.get("edition_count", 1) > 1 and p.get("first_year") != year:
            note += f"初版の刊行年{p['first_year']}年は同APIで同書名の全版を引いて確認。"
        if overseas:
            note += f"原著の初版年{first}年はOpenLibrary/英語版Wikipediaの書誌による。"
        w["sourceNote"] = a.get("note") or note

        batch["works"].append(w)

    out_path.write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"works={len(batch['works'])} authors={len(batch['newAuthors'])} "
          f"translators={len(batch['newTranslators'])} publishers={len(batch['newPublishers'])} "
          f"techs={len(batch['newTechs'])} -> {out_path}")
    if problems:
        print("-- 未反映 --")
        for x in problems:
            print(" ", x)


if __name__ == "__main__":
    main()
