import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_photos as fp  # noqa: E402


class Resp:
    def __init__(self, content, ctype="image/jpeg"):
        self.content, self.headers = content, {"Content-Type": ctype}

    def raise_for_status(self):
        pass


class Session:
    def __init__(self, resp):
        self.resp, self.urls = resp, []

    def get(self, url, timeout=None):
        self.urls.append(url)
        return self.resp


URL = "https://www.europarl.europa.eu/mepphoto/1.jpg"


def test_saves_and_skips_unchanged(tmp_path):
    meps = [{"id": 1, "photo_url": URL}, {"id": 2, "photo_url": None}]
    s = Session(Resp(b"MOCK_JPEG"))
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 1, "unchanged": 0, "missing": 1}
    assert (tmp_path / "1.jpg").read_bytes() == b"MOCK_JPEG"
    assert fp.fetch_photos(meps, tmp_path, s, 0) == {"saved": 0, "unchanged": 1, "missing": 1}


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
