"""Typ hlasování (vote_kind) odvozený deterministicky z amendment_subject a description.

Žádná AI, jen tabulka pravidel. Hodnoty:
  final                  závěrečné hlasování o celém textu (usnesení, legislativní návrh, rozhodnutí)
  provisional_agreement  hlasování o prozatímní dohodě s Radou (v praxi schválení zákona)
  rejection              návrh na zamítnutí celého textu (inverted: PRO = text zamítnout)
  mandate                rozhodnutí zahájit interinstitucionální jednání (mandát pro vyjednávání)
  urgency                žádost o naléhavý postup
  amendment              pozměňovací návrh
  split_part             dílčí / oddělené hlasování o části textu (odstavec, bod odůvodnění…)
  other                  ostatní (procedurální hlasování, program…); neznámé vzory se vypíší do logu
"""

from __future__ import annotations

import re

FINAL_KINDS = {"final", "provisional_agreement"}
KIND_LABELS = {
    "final": "závěrečné hlasování",
    "provisional_agreement": "prozatímní dohoda s Radou",
    "rejection": "návrh na zamítnutí",
    "mandate": "mandát k jednání s Radou",
    "urgency": "naléhavý postup",
    "amendment": "pozměňovací návrh",
    "split_part": "dílčí hlasování",
    "other": "procedurální / ostatní",
}

_REJECTION = re.compile(r"^(Proposition de rejet|Proposition de rejeter|Rejet de la position du Conseil)", re.I)
_MANDATE = re.compile(r"^Décision d'engager des négociations", re.I)
_URGENCY = re.compile(r"^Demande de décision d'urgence", re.I)
_PROVISIONAL = re.compile(r"^Accord provisoire", re.I)
_AMENDMENT = re.compile(r"(^|[\s-])Am\s*\d|Amendements?\b", re.I)
_PART = re.compile(r"(§|considérant|visa|article|alinéa|paragraphe|point|annexe|tiret)", re.I)


def classify(vote: dict) -> tuple[str, bool]:
    """Vrací (vote_kind, inverted). inverted = hlas PRO znamená text zamítnout."""
    subject = (vote.get("amendment_subject") or "").strip()
    desc = (vote.get("description") or "").strip()
    subj_l = subject.lower()

    if subj_l.startswith(("proposal for rejection", "proposal to reject")) or _REJECTION.search(desc):
        return "rejection", True
    if _MANDATE.search(desc):
        return "mandate", False
    if _URGENCY.search(desc):
        return "urgency", False
    if subj_l == "provisional agreement" or _PROVISIONAL.search(desc):
        return "provisional_agreement", False
    if vote.get("is_main"):
        return "final", False
    if _AMENDMENT.search(desc):
        return "amendment", False
    if _PART.search(desc):
        return "split_part", False
    if not desc and re.fullmatch(r"\d+", str(vote.get("amendment_number") or "")):
        return "amendment", False
    return "other", False


def kind_of(vote: dict) -> str:
    """vote_kind z dat, nebo dopočítaný (starší měsíční soubory pole nemají)."""
    return vote.get("vote_kind") or classify(vote)[0]


def is_final(vote: dict) -> bool:
    """Závěrečné hlasování o textu (final nebo prozatímní dohoda)."""
    return kind_of(vote) in FINAL_KINDS
