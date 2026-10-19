"""Ruční synonyma pro hledání hlasování (data/manual/search_synonyms.json, audit UX P1): jen k existujícím tématům."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_synonym_keys_exist_and_values_are_words():
    syn = json.loads((ROOT / "data" / "manual" / "search_synonyms.json").read_text(encoding="utf-8"))
    cats = json.loads((ROOT / "data" / "categories.json").read_text(encoding="utf-8"))
    topics = json.loads((ROOT / "data" / "manual" / "topics_cs.json").read_text(encoding="utf-8"))["labels"]
    assert set(syn) == {"note", "cats", "topics"}
    assert set(syn["cats"]) <= set(cats), set(syn["cats"]) - set(cats)
    assert set(syn["topics"]) <= set(topics), set(syn["topics"]) - set(topics)
    for words in [*syn["cats"].values(), *syn["topics"].values()]:
        assert words and all(isinstance(w, str) and w.strip() == w and len(w) >= 2 for w in words)
        assert not any(ch.isdigit() for w in words for ch in w)
