import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import export_open_repo as ex  # noqa: E402

PRIVATE = ["build_pages.py", "hub.py", "layout.py", "build_cards.py", "hero_art.py", "build_brand.py", "fetch_photos.py", "add_logo.py",
           "commit_data.sh"]


def test_export_is_self_contained_and_keeps_site_private(tmp_path):
    out = tmp_path / "open"
    files = ex.export(out)
    for name in PRIVATE:
        assert f"scripts/{name}" not in files
    assert not any(f.startswith(("public/", ".github/workflows/weekly", "docs/", "vercel")) for f in files)
    assert {"README.md", "LICENSE", "DATA_LICENSE.md", "requirements.txt", ".github/workflows/tests.yml"} <= set(files)
    assert "GNU AFFERO GENERAL PUBLIC LICENSE" in (out / "LICENSE").read_text(encoding="utf-8")
    # exportovaný strom musí projít vlastními testy (žádný import soukromého modulu)
    res = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=out, capture_output=True, text=True)
    assert res.returncode == 0, res.stdout[-1500:] + res.stderr[-500:]


def test_export_cleans_old_files_but_keeps_git(tmp_path):
    out = tmp_path / "open"
    (out / ".git").mkdir(parents=True)
    (out / "stary.txt").write_text("x", encoding="utf-8")
    ex.export(out)
    assert not (out / "stary.txt").exists() and (out / ".git").exists()
