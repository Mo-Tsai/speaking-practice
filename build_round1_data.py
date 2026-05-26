"""Build Round 1 architecture data JSON from basic_english_words.csv.

Reads the 850-word CSV, classifies each word into Ogden's three-tier system
(Operations / Things / Qualities), and writes round1-data.json for the
architecture page to consume.

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
        return "operations", "verbs-18"
    if tag == "op":
        return "operations", "other-ops"
    if tag == "n":
        return "things", "general"
    if tag == "pic":
        return "things", "picturable"
    if tag == "adj":
        return "qualities", "general"
    if tag == "opp":
        return "qualities", "opposites"
    return "unknown", "unknown"


def main():
    by_cat = {
        "operations": {"verbs-18": [], "other-ops": []},
        "things": {"general": [], "picturable": []},
        "qualities": {"general": [], "opposites": []},
        "unknown": {"unknown": []},
    }

    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = row["Word"].strip()
            tag, zh = parse_tag(row["Translation/Explanation"])
            example = row["Example Sentence"].strip()
            top, sub = categorize(word, tag)
            by_cat[top][sub].append({
                "word": word,
                "zh": zh,
                "ex": example,
                "tag": tag,
            })

    for top in by_cat:
        for sub in by_cat[top]:
            by_cat[top][sub].sort(key=lambda x: x["word"].lower())

    structure = {
        "version": "round1.v1",
        "total": sum(len(s) for t in by_cat.values() for s in t.values() if t is not by_cat["unknown"]),
        "categories": [
            {
                "id": "operations",
                "label": "Operations",
                "label_zh": "操作詞",
                "tagline": "句子的骨幹 — 動詞、介詞、代名詞、邏輯詞",
                "accent": "slate",
                "subcategories": [
                    {
                        "id": "verbs-18",
                        "label": "18 個動詞 (Operators)",
                        "tagline": "BE850 的核心引擎 — 跟其他字組合形成所有 paraphrase",
                        "words": by_cat["operations"]["verbs-18"],
                    },
                    {
                        "id": "other-ops",
                        "label": "其他操作詞",
                        "tagline": "介詞 / 代名詞 / 邏輯詞 / 問句詞",
                        "words": by_cat["operations"]["other-ops"],
                    },
                ],
            },
            {
                "id": "things",
                "label": "Things",
                "label_zh": "名詞",
                "tagline": "可以指稱的事物 — 句子的填入物",
                "accent": "sage",
                "subcategories": [
                    {
                        "id": "general",
                        "label": "一般 (General)",
                        "tagline": "抽象概念、活動、屬性",
                        "words": by_cat["things"]["general"],
                    },
                    {
                        "id": "picturable",
                        "label": "可畫 (Picturable)",
                        "tagline": "看得到摸得到的具體物",
                        "words": by_cat["things"]["picturable"],
                    },
                ],
            },
            {
                "id": "qualities",
                "label": "Qualities",
                "label_zh": "形容詞",
                "tagline": "描述事物特質的字",
                "accent": "rose",
                "subcategories": [
                    {
                        "id": "general",
                        "label": "一般 (General)",
                        "tagline": "獨立的形容詞",
                        "words": by_cat["qualities"]["general"],
                    },
                    {
                        "id": "opposites",
                        "label": "反義 (Opposites)",
                        "tagline": "與其他形容詞成對的反義字",
                        "words": by_cat["qualities"]["opposites"],
                    },
                ],
            },
        ],
    }

    if by_cat["unknown"]["unknown"]:
        structure["unclassified"] = by_cat["unknown"]["unknown"]

    OUT_PATH.write_text(
        json.dumps(structure, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_classified = sum(
        len(s) for t in by_cat.values() for s in t.values()
    ) - len(by_cat["unknown"]["unknown"])
    print(f"Wrote {OUT_PATH.name}")
    print(f"Total classified: {total_classified} / 850 expected")
    print()
    for cat in structure["categories"]:
        cat_total = sum(len(s["words"]) for s in cat["subcategories"])
        print(f"  {cat['label']} ({cat['label_zh']}): {cat_total}")
        for sub in cat["subcategories"]:
            print(f"    {sub['label']}: {len(sub['words'])}")
    if by_cat["unknown"]["unknown"]:
        print()
        print(f"  UNCLASSIFIED ({len(by_cat['unknown']['unknown'])}):")
        for w in by_cat["unknown"]["unknown"]:
            print(f"    {w['word']} (tag={w['tag']!r})")


if __name__ == "__main__":
    main()
