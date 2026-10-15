# Veřejný repozitář s výpočty

Hlavní repozitář může být soukromý. Veřejně zůstává jen to, co dokládá, že čísla počítá otevřený kód: `scripts/` s výpočty,
jejich testy, ruční doplňky dat a licence. Web (`public/`), generování stránek a karet a nasazení zůstávají soukromé.

## Jak to funguje

- `scripts/export_open_repo.py` složí obsah veřejného repa podle **seznamů souborů** (`PUBLIC_SCRIPTS`, `PUBLIC_TESTS`,
  `PUBLIC_MANUAL`). Nový soubor je ve výchozím stavu soukromý, dokud ho do seznamu nepřidáte. Test
  `tests/test_export_open_repo.py` hlídá, že export neobsahuje soukromé moduly a že exportovaný strom projde vlastními testy.
- Workflow `.github/workflows/sync-open-repo.yml` po každé změně `scripts/`, `tests/`, `data/manual/` na `main` export spustí
  a pushne ho do veřejného repa. Veřejné repo má jen commity „Synchronizace z hlavního repa“; historie soukromého repa
  se nezveřejňuje.
- README, licence (AGPL-3.0) a workflow s testy veřejného repa jsou v `docs/open-repo/`.
- Odkazy na webu (patička, O projektu, odkazy na skripty, issues) vedou do veřejného repa; adresa je v `scripts/layout.py` (`REPO`)
  a v odkazech v `public/`.

## Co musíte udělat ručně (jednorázově)

1. Na GitHubu vytvořit **prázdné veřejné** repo `ep-watch-cz-open` (bez README a licence), v Settings → Features zapnout **Issues**.
   Pod jiným názvem: nastavit proměnnou `OPEN_REPO` (viz bod 3) a nahradit adresu `Pjendrix/ep-watch-cz-open` ve webu.
2. Vytvořit **fine-grained personal access token** (Settings → Developer settings): jen pro to veřejné repo, oprávnění
   *Contents: Read and write*.
3. V soukromém repu (Settings → Secrets and variables → Actions) přidat secret `OPEN_REPO_TOKEN` s tímto tokenem
   (případně proměnnou `OPEN_REPO` s názvem `vlastnik/repo`).
4. V Actions spustit „Synchronizace veřejného repa“ ručně (Run workflow); ověřit, že se ve veřejném repu objevily soubory.
5. Teprve potom v soukromém repu nastavit Settings → General → Danger zone → **Change visibility → Private** a ve Vercelu
   zkontrolovat, že GitHub aplikace má k repu přístup (nasazení musí dál běžet).

## Pozor

- Soukromé repo má měsíční limit minut GitHub Actions (Free plán 2 000 min); týdenní data a kontrola webu na každý PR se do něj počítají.
- Data v `data/*.json` jsou veřejná, protože je web servíruje (`/data/…`). Licence zůstává ODbL / CC BY, viz `DATA_LICENSE.md`.
- Změna licence u již zveřejněných verzí zpětně neplatí: kdo dnes stáhl veřejné repo pod MIT, smí tu verzi používat dál.
