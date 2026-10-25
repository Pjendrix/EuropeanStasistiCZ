import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import public_data as pd  # noqa: E402

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def test_every_json_loaded_by_js_is_published():
    """V17: soubor, který stránka načítá přes getJSON, musí být na whitelistu (jinak by na Vercelu chyběl)."""
    loaded = set()
    for f in PUBLIC.rglob("*.js"):
        if "data" in f.relative_to(PUBLIC).parts:
            continue
        src = f.read_text(encoding="utf-8")
        loaded |= set(re.findall(r'"((?:[a-z_]+/)*[a-z_-]+\.json)"', src))
        loaded |= {f"{d}/*" for d in re.findall(r"`([a-z_]+)/(?:[a-z_]+/)?\$\{[^}]+\}[a-z_]*\.json`", src)}
    published = set(pd.FILES) | {f"{d}/*" for d in pd.DIRS} | {"votes/*", "duel/*"}  # votes/id a duel/ z build_shards.py
    in_dir = {x for x in loaded if x.split("/")[0] in pd.DIRS}  # celé složky (meps/, parties/, eugroups/)
    missing = sorted(loaded - published - in_dir)
    assert not missing, f"web načítá soubory, které nejdou na Vercel: {missing}"


def test_data_page_files_published():
    import build_pages as bp

    published = set(pd.FILES) | {f"{d}/{{id}}.json" for d in pd.DIRS} | {"votes/id/{id}.json"}
    assert {f for f, *_ in bp.DATA_FILES} <= published
