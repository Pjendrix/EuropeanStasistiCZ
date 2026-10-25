"""Export veřejné části projektu (výpočty a testy) do složky pro veřejný repozitář.

Soukromý hlavní repozitář obsahuje web, generování stránek a karet a nasazení. Veřejně se zveřejňují jen skripty, které počítají
čísla, jejich testy a ruční doplňky dat (viz docs/OPEN_REPO.md). Co se exportuje, určují seznamy níže; nic jiného se nekopíruje,
takže nový soubor je ve výchozím stavu soukromý, dokud ho nepřidáte do PUBLIC_SCRIPTS / PUBLIC_TESTS.

Použití:
    python scripts/export_open_repo.py --out ../open-repo
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PUBLIC_SCRIPTS = [
    "activity.py",
    "adopted_texts.py",
    "agenda.py",
    "amendments.py",
    "attendance.py",
    "benchmarks.py",
    "build_home.py",
    "build_web.py",
    "categories.py",
    "category_stats.py",
    "check_data.py",
    "compute_stats.py",
    "statements.py",
    "delegations.py",
    "duel.py",
    "ep_groups.py",
    "fetch_agenda.py",
    "fetch_amendments.py",
    "fetch_attendance.py",
    "fetch_group_chairs.py",
    "fetch_group_web.py",
    "fetch_meps.py",
    "fetch_proposals.py",
    "fetch_speeches.py",
    "fetch_votes.py",
    "group_countries.py",
    "group_stats.py",
    "key_votes.py",
    "labels_cs.py",
    "overrides.py",
    "own_work.py",
    "preliminary.py",
    "fetch_preliminary.py",
    "quiz.py",
    "quiz_groups.py",
    "quiz_summaries.py",
    "radar.py",
    "vote_summaries.py",
    "vote_kinds.py",
    "vote_parties.py",
    "work_hub.py",
]
PUBLIC_TESTS = [
    "test_activity.py",
    "test_agenda.py",
    "test_amendments.py",
    "test_attendance.py",
    "test_benchmarks.py",
    "test_build_home.py",
    "test_build_web.py",
    "test_card_items.py",
    "test_categories.py",
    "test_category_stats.py",
    "test_check_data.py",
    "test_compute_stats.py",
    "test_delegations.py",
    "test_duel.py",
    "test_ep_groups.py",
    "test_eugroup_chairs.py",
    "test_eugroup_countries.py",
    "test_fetch_group_web.py",
    "test_fetch_meps.py",
    "test_fetch_proposals.py",
    "test_fetch_votes.py",
    "test_group_stats.py",
    "test_key_votes.py",
    "test_labels.py",
    "test_labels_cs.py",
    "test_overrides.py",
    "test_own_work.py",
    "test_preliminary.py",
    "test_quiz.py",
    "test_quiz_groups.py",
    "test_quiz_summaries.py",
    "test_radar.py",
    "test_vote_kinds.py",
    "test_vote_summaries.py",
    "test_work_hub.py",
]
PUBLIC_MANUAL = ["colors.json", "countries_cs.json", "group_labels.json", "overrides.json", "party_labels.json", "topics_cs.json"]


def export(out: Path) -> list[str]:
    """Vytvoří obsah veřejného repozitáře v out (staré soubory v out smaže, kromě .git). Vrací seznam exportovaných souborů."""
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name == ".git":
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()
    written: list[str] = []

    def copy(src: Path, dst: Path) -> None:
        if not src.exists():
            raise FileNotFoundError(f"chybí {src.relative_to(ROOT)} (seznam v export_open_repo.py je zastaralý)")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        written.append(str(dst.relative_to(out)))

    for name in PUBLIC_SCRIPTS:
        copy(ROOT / "scripts" / name, out / "scripts" / name)
    for name in PUBLIC_TESTS:
        copy(ROOT / "tests" / name, out / "tests" / name)
    for f in sorted((ROOT / "tests" / "fixtures").rglob("*")):
        if f.is_file():
            copy(f, out / "tests" / "fixtures" / f.relative_to(ROOT / "tests" / "fixtures"))
    for name in PUBLIC_MANUAL:
        copy(ROOT / "data" / "manual" / name, out / "data" / "manual" / name)
    copy(ROOT / "docs" / "open-repo" / "README.template.md", out / "README.md")
    copy(ROOT / "docs" / "open-repo" / "LICENSE-AGPL-3.0.txt", out / "LICENSE")
    copy(ROOT / "docs" / "open-repo" / "tests.yml", out / ".github" / "workflows" / "tests.yml")
    copy(ROOT / "DATA_LICENSE.md", out / "DATA_LICENSE.md")
    # zamčené verze s hashi (audit B3): výpočty ve veřejném repu běží na stejných knihovnách
    for name in ("requirements.in", "requirements.txt"):
        shutil.copy2(ROOT / name, out / name)
        written.append(name)
    (out / ".gitignore").write_text("__pycache__/\n.pytest_cache/\n.cache/\n", encoding="utf-8")
    written.append(".gitignore")
    return sorted(written)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="cílová složka (vytvoří se)")
    args = p.parse_args(argv)
    files = export(args.out)
    print(f"export: {len(files)} souborů do {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
