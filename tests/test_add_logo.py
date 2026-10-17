import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import add_logo as al  # noqa: E402
import compute_stats as cs  # noqa: E402


def setup(tmp_path):
    (tmp_path / "data" / "manual").mkdir(parents=True)
    (tmp_path / "data" / "manual" / "logos.json").write_text(
        json.dumps({"groups": {"MOCK_G": {"file": None, "source": None, "chybi": "x"}}, "parties": {"1": {"file": None}}}), encoding="utf-8"
    )


def test_add_svg_and_aspect(tmp_path):
    setup(tmp_path)
    src = tmp_path / "in.svg"
    src.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect/></svg>', encoding="utf-8")
    f = al.add_logo("ep", "MOCK_G", src, "https://example.org/MOCK", root=tmp_path, today="2026-01-01")
    assert f == "assets/logos/ep/MOCK_G.svg"
    entry = json.loads((tmp_path / "data/manual/logos.json").read_text(encoding="utf-8"))["groups"]["MOCK_G"]
    assert entry["source"] == "https://example.org/MOCK" and entry["retrieved"] == "2026-01-01" and "chybi" not in entry
    assert cs.logo_aspect(tmp_path / "public" / f) == 4.0


def test_add_png_converts_to_webp(tmp_path):
    from PIL import Image

    setup(tmp_path)
    src = tmp_path / "in.png"
    Image.new("RGBA", (600, 300), (255, 0, 0, 255)).save(src)
    f = al.add_logo("cz", "1", src, "https://example.org/MOCK", root=tmp_path)
    with Image.open(tmp_path / "public" / f) as im:
        assert im.size == (256, 128)
    assert cs.logo_aspect(tmp_path / "public" / f) == 2.0


def test_rejects_unsafe_svg_and_missing_source(tmp_path):
    setup(tmp_path)
    src = tmp_path / "in.svg"
    src.write_text('<svg onload="x()"></svg>', encoding="utf-8")
    with pytest.raises(al.LogoError, match="skript"):
        al.add_logo("ep", "MOCK_G", src, "https://example.org", root=tmp_path)
    with pytest.raises(al.LogoError, match="source"):
        al.add_logo("ep", "MOCK_G", src, "", root=tmp_path)


def test_logo_aspect_width_height_only(tmp_path):
    f = tmp_path / "a.svg"
    f.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="279" height="42" fill="none"></svg>', encoding="utf-8")
    assert cs.logo_aspect(f) == round(279 / 42, 3)
    assert cs.logo_aspect(tmp_path / "missing.svg") is None
