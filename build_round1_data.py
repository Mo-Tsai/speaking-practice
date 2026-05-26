"""Build Round 1 data JSON from basic_english_words.csv.

Flat 4-category output:
  - verbs (18 operators)
  - things (general + picturable nouns)
  - qualities (general + opposite adjectives)
  - connectors (prepositions / pronouns / logic words / question words)

Run from repo root:
    python build_round1_data.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
CSV_PATH = ROOT / "basic_english_words.csv"
OUT_PATH = ROOT / "round1-data.json"

TAG_RE = re.compile(r"\(([^)]+)\)")

OPERATORS_18 = {
    "be", "come", "do", "get", "give", "go", "have", "keep", "let",
    "make", "may", "put", "say", "see", "seem", "send", "take", "will",
}


def parse_tag(translation_field):
    m = TAG_RE.search(translation_field)
    if not m:
        return None, translation_field.strip()
    tag = m.group(1).strip().rstrip(".")
    zh_clean = TAG_RE.sub("", translation_field).strip()
    return tag, zh_clean


def categorize(word, tag):
    if tag == "operator" or word in OPERATORS_18:
        return "verbs"
    if tag == "op":
        return "connectors"
    if tag in ("n", "pic"):
        return "things"
    if tag in ("adj", "opp"):
        return "qualities"
    return "unknown"


def main():
    buckets = {"verbs": [], "things": [], "qualities": [], "connectors": [], "unknown": []}

    with CSV_PATH.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            word = row["Word"].strip()
            tag, zh = parse_tag(row["Translation/Explanation"])
            ex = row["Example Sentence"].strip()
            cat = categorize(word, tag)
            buckets[cat].append({"word": word, "zh": zh, "ex": ex})

    for b in buckets.values():
        b.sort(key=lambda x: x["word"].lower())

    meta = [
        ("verbs", "動詞", "Verbs", "paraphrase 的核心引擎 — 18 個動詞跟其他字組合就能表達任何動作", "slate"),
        ("things", "名詞", "Things", "可以指稱的事物 — 句子的填入物", "sage"),
        ("qualities", "形容詞", "Qualities", "描述事物的特質", "rose"),
        ("connectors", "連接詞", "Connectors", "介詞、代名詞、邏輯詞、問句詞 — 把字串成句子的膠水", "sand"),
    ]

    categories = []
    for cid, label, label_en, tagline, accent in meta:
        categories.append({
            "id": cid,
            "label": label,
            "label_en": label_en,
            "tagline": tagline,
            "accent": accent,
            "words": buckets[cid],
        })

    out = {
        "version": "round1.v2",
        "total": sum(len(b) for b in buckets.values() if b is not buckets["unknown"]),
        "categories": categories,
    }
    if buckets["unknown"]:
        out["unclassified"] = buckets["unknown"]

    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_PATH.name}")
    print(f"Total: {out['total']}")
    for c in categories:
        print(f"  {c['label']} ({c['label_en']}): {len(c['words'])}")
    if buckets["unknown"]:
        print(f"  UNCLASSIFIED: {len(buckets['unknown'])}")


if __name__ == "__main__":
    main()
