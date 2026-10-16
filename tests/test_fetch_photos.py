import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_photos as fp  # noqa: E402


class Resp:
    def __init__(self, content, ctype="image/jpeg", status=200, headers=None):
        self.content, self.status_code = content, status
        self.headers = {"Content-Type": ctype, **(headers or {})}

    def raise_for_status(self):
        pass


class Session:
    def __init__(self, resp):
        self.resp, self.urls = resp, []

    def get(self, url, timeout=None):
        self.urls.append(url)
        return self.resp


URL = "https://www.europarl.europa.eu/mepphoto/1.jpg"


def mock_jpeg(w: int, h: int) -> bytes:
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 130, 140)).save(buf, "JPEG")
    return buf.getvalue()


def test_saves_and_skips_unchanged(tmp_path):
    meps = [{"id": 1, "photo_url": URL}, {"id": 2, "photo_url": None}]
    small = mock_jpeg(160, 200)
    s = Session(Resp(small))
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 1, "unchanged": 0, "missing": 1, "blocked": 0}
    assert (tmp_path / "1.jpg").read_bytes() == small  # malý portrét se ukládá beze změny
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 0, "unchanged": 1, "missing": 1, "blocked": 0}


def test_big_portrait_shrinks_and_stays_unchanged(tmp_path):
    """Velký portrét se zmenší na nejvýš MAX_SIDE; další stažení stejného souboru ho už nepřepíše (repo neroste)."""
    from PIL import Image
    meps = [{"id": 1, "photo_url": URL}]
    s = Session(Resp(mock_jpeg(1200, 1500)))
    assert fp.fetch_photos(meps, tmp_path, s, 0)["saved"] == 1
    with Image.open(tmp_path / "1.jpg") as im:
        assert max(im.size) == fp.MAX_SIDE and im.size == (480, 600)
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 0, "unchanged": 1, "missing": 0, "blocked": 0}


def test_unreadable_image_is_format_error(tmp_path):
    with pytest.raises(fp.FormatError, match="čitelný"):
        fp.fetch_photos([{"id": 1, "photo_url": URL}], tmp_path, Session(Resp(b"MOCK_NOT_JPEG")), 0)


def test_rejects_non_jpeg(tmp_path):
    with pytest.raises(fp.FormatError, match="není JPEG"):
        fp.fetch_photos([{"id": 1, "photo_url": URL}], tmp_path, Session(Resp(b"<html>", "text/html")), 0)


def test_rejects_foreign_url(tmp_path):
    with pytest.raises(fp.FormatError, match="neočekávaná URL"):
        fp.fetch_photos([{"id": 1, "photo_url": "https://example.com/x.jpg"}], tmp_path, Session(Resp(b"")), 0)


def test_make_thumbs(tmp_path):
    from PIL import Image
    Image.new("RGB", (400, 500), "navy").save(tmp_path / "1.jpg")
    meps = [{"id": 1}, {"id": 2}]  # 2 nemá portrét
    assert fp.make_thumbs(meps, tmp_path) == 1
    with Image.open(tmp_path / "thumbs" / "1.webp") as im:
        assert im.size == (160, 200) and im.format == "WEBP"
    assert fp.make_thumbs(meps, tmp_path) == 0  # už existuje


def test_waf_block_keeps_existing_and_stops(tmp_path):
    (tmp_path / "1.jpg").write_bytes(b"MOCK_OLD")
    meps = [{"id": 1, "photo_url": URL}, {"id": 2, "photo_url": URL.replace("1.jpg", "2.jpg")}]
    s = Session(Resp(b"", "text/html; charset=UTF-8", status=202, headers={"x-amzn-waf-action": "challenge"}))
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 0, "unchanged": 0, "missing": 0, "blocked": 2}
    assert len(s.urls) == 1  # po první blokaci už se nedotazuje
    assert (tmp_path / "1.jpg").read_bytes() == b"MOCK_OLD"
