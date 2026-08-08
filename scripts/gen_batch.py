#!/usr/bin/env python3
"""prep.py の結果 + 手書きの注釈TSV から apply_batch.py 用の batch.json を組み立てる(tech-db版)。

  python3 scripts/gen_batch.py prep.json anno.tsv batch.json

anno.tsv(1行1冊、タブ区切り):
  <n> <themeIds(カンマ区切り)> <techIds(カンマ区切り)> <未使用> <紹介文> [<flags>] [<overrides>]
    未使用    … かつての読者レベル欄。2026-08-08に廃止したので何を書いても無視される
    flags     … o=海外原著(origin=overseas), x=採用しない, n=紹介文の典拠が無く内容未確認
    overrides … title / kana / pub(=publisherId) / author(名前、カンマ区切り) / year / isbn / id /
                awards(=「年:結果」を | 区切り。awardIdは it-engineer-book-award 固定)

受賞歴はITエンジニア本大賞のみを扱う(このサイトに登録されている唯一の賞のため)。
著者は authors.json と名前で突合し、無ければNDLの読みからローマ字idを採番する。
"""
import json
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prep import NDL, NS, clean_person, get, hiragana, norm, romaji  # noqa: E402

SRC = Path(__file__).resolve().parent.parent / "public" / "data" / "source"
TODAY = "2026-08-07"
KANA_CACHE = Path(__file__).resolve().parent.parent / ".kana-cache.json"
AWARD_ID = "it-engineer-book-award"

SOURCE_NOTE = ("書名・著者・出版社・刊行年・ISBNは国立国会図書館サーチAPI(opensearch)の書誌で、"
               "受賞歴はITエンジニア本大賞公式サイト(shoeisha.co.jp/campaign/award/)の各年の結果ページで"
               "確認({date}照会)。紹介文は版元の内容紹介を参考にした独自要約(コピペなし)。")


def load(name):
    return json.load(open(SRC / f"{name}.json", encoding="utf-8"))


def kana_lookup(name, cache):
    if name in cache:
        return cache[name]
    xml = get(NDL + "?" + urllib.parse.urlencode({"creator": name, "cnt": "10"}), sleep=2)
    time.sleep(1.2)
    got = ""
    if xml:
        try:
            root = ET.fromstring(xml)
        except ET.ParseError:
            root = None
        if root is not None:
            for item in root.iter("item"):
                cs = [clean_person(n.text) for n in item.findall("dc:creator", namespaces=NS)]
                ts = [clean_person(n.text) for n in item.findall("dcndl:creatorTranscription", namespaces=NS)]
                for c, t in zip(cs, ts):
                    if norm(c) == norm(name) and t:
                        got = hiragana(t).replace(" ", "")
                        break
                if got:
                    break
    cache[name] = got
    return got


def main():
    prep_path, anno_path, out_path = sys.argv[1:4]
    prep = {r["n"]: r for r in json.load(open(prep_path, encoding="utf-8"))}

    authors, publishers = load("authors"), load("publishers")
    themes, techs, works = load("themes"), load("techs"), load("works")
    author_by_name = {norm(a["name"]): a["id"] for a in authors}
    pub_by_name = {}
    for p in publishers:
        pub_by_name[norm(p["name"])] = p["id"]
        m = re.match(r"^([^（(]+)[（(]([^）)]+)[）)]", p["name"])
        if m:
            pub_by_name.setdefault(norm(m.group(1)), p["id"])
            pub_by_name.setdefault(norm(m.group(2)), p["id"])
    theme_ids = {t["id"] for t in themes}
    tech_ids = {t["id"] for t in techs}
    work_ids = {w["id"] for w in works}
    author_ids_taken = {a["id"] for a in authors}
    cache = json.loads(KANA_CACHE.read_text(encoding="utf-8")) if KANA_CACHE.exists() else {}

    new_authors, out_works, problems = [], [], []

    def uniq_id(base, taken):
        base = base or "work"
        cand, i = base, 2
        while cand in taken:
            cand = f"{base}-{i}"
            i += 1
        taken.add(cand)
        return cand

    for ln in open(anno_path, encoding="utf-8"):
        ln = ln.rstrip("\n")
        if not ln.strip() or ln.startswith("#"):
            continue
        f = ln.split("\t")
        n = int(f[0])
        theme_str = f[1] if len(f) > 1 else ""
        tech_str = f[2] if len(f) > 2 else ""
        synopsis = f[4] if len(f) > 4 else ""
        flags = f[5] if len(f) > 5 else ""
        ov = {}
        if len(f) > 6 and f[6].strip():
            for kv in f[6].split(";"):
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    ov[k.strip()] = v.strip()
        if "x" in flags:
            continue
        r = prep.get(n)
        if r is None or not r.get("ndl"):
            problems.append(f"n={n} prep結果なし")
            continue
        nd = r["ndl"]

        title = ov.get("title") or r["title"]
        kana = re.sub(r"[:：].*$", "", ov.get("kana") or r.get("titleKana", ""))
        wid = ov.get("id") or uniq_id(r.get("workId", "").split(":")[0][:48].strip("-"), work_ids)

        persons = {p["name"]: p for p in r.get("persons", [])}
        if ov.get("author"):
            a_names = [x.strip() for x in ov["author"].split(",")]
        elif r["author"]:
            a_names = [r["author"]]
        else:
            # 候補側に著者名が無い場合はNDLの責任表示から取る(公式サイトが著者を載せていない年がある)
            a_names = [p["name"] for p in r.get("persons", [])][:3]
        author_ids = []
        for nm in a_names:
            nm = re.sub(r"[\s　]+", "", nm)
            if not nm:
                continue
            key = norm(nm)
            if key in author_by_name:
                author_ids.append(author_by_name[key])
                continue
            k = (persons.get(nm) or {}).get("kana", "") or kana_lookup(nm, cache)
            base = romaji(k) if k else ""
            if not re.fullmatch(r"[a-z0-9\-]+", base or ""):
                base = "author-" + str(abs(hash(nm)) % 10 ** 6)
            pid = uniq_id(base, author_ids_taken)
            new_authors.append({"id": pid, "name": nm, "nameKana": k or nm,
                                "description": "技術書の著者。",
                                "externalLinks": {},
                                "sourceNote": f"国立国会図書館サーチの書誌で確認({TODAY})。",
                                "updatedAt": TODAY})
            author_by_name[key] = pid
            author_ids.append(pid)
        if not author_ids:
            problems.append(f"n={n} {title}: 著者を解決できない")
            continue

        pub_id = ov.get("pub", "") or pub_by_name.get(
            norm(re.sub(r"\s*[（(].*$", "", nd.get("publisher", "") or "")), "")
        if not pub_id:
            problems.append(f"n={n} {title}: 出版社未解決 (NDL='{nd.get('publisher')}')")
            continue

        themes_l = [t.strip() for t in theme_str.split(",") if t.strip()]
        techs_l = [t.strip() for t in tech_str.split(",") if t.strip()]
        bad = [t for t in themes_l if t not in theme_ids] + [t for t in techs_l if t not in tech_ids]
        if bad:
            problems.append(f"n={n} {title}: 未知のid {bad}")
            continue

        awards = []
        # 受賞歴の区切りは | (; は overrides のキー区切りに使っているため)
        for a in (ov.get("awards", "") or "").split("|"):
            a = a.strip()
            if not a:
                continue
            y, _, res = a.partition(":")
            if y and res:
                awards.append({"awardId": AWARD_ID, "year": int(y), "result": res})

        w = {
            "id": wid, "title": title, "titleKana": kana,
            "authorIds": author_ids, "techIds": techs_l, "translatorIds": [],
            "publisherId": pub_id, "themeIds": themes_l,
            "origin": "overseas" if "o" in flags else "jp",
            "isbn": ov.get("isbn") or nd.get("isbn") or "",
            "firstPublishedYear": int(ov.get("year") or nd.get("firstYear") or 0) or None,
            "synopsis": synopsis,
            "awardResults": awards,
            "externalLinks": {},
            "sourceNote": SOURCE_NOTE.format(date=TODAY)
            + ("紹介文の典拠が見つからなかったため、内容の記述は書誌事項から確認できる範囲にとどめている。"
               if "n" in flags else ""),
            "updatedAt": TODAY,
        }
        out_works.append(w)

    KANA_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    batch = {"newAuthors": new_authors, "newTranslators": [], "newPublishers": [],
             "newTechs": [], "newThemes": [], "newAwards": [], "works": out_works}
    Path(out_path).write_text(json.dumps(batch, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"works={len(out_works)} newAuthors={len(new_authors)}")
    for p in problems:
        print("! " + p)


if __name__ == "__main__":
    main()
