"""Oblouk hlasování na úvodu (návrh A): tečky a číslo „pro : proti“ v jednom SVG, nic se nepřekrývá."""

import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import hub  # noqa: E402

R = hub.HEMI_SEAT


def test_slot_count_and_rows():
    for n in (1, 2, 5, 19, 20, 21, 22, 30):
        assert len(hub.hemi_slots(n)) == n
    s = hub.hemi_slots(21)
    radii = sorted(round(math.hypot(x - hub.HEMI_CX, hub.HEMI_CY - y)) for x, y in s)
    assert radii.count(114) == 8 and radii.count(178) == 13  # 8 + 13 úměrně poloměru


def test_no_overlap_and_number_box_free():
    x0, y0, x1, y1 = hub.HEMI_NUM_BOX
    assert (x0, y0, x1, y1) == (130, 160, 270, 250)
    for n in (19, 20, 21, 22):
        s = hub.hemi_slots(n)
        for i, a in enumerate(s):
            for b in s[i + 1 :]:
                assert math.dist(a, b) > 2 * R, (n, a, b)  # tečky se nepřekrývají
            # tečka (kruh s poloměrem R) nezasahuje do obdélníku čísla
            cx, cy = min(max(a[0], x0), x1), min(max(a[1], y0), y1)
            assert math.dist(a, (cx, cy)) > R, (n, a)
            # a celá je ve viewBoxu
            assert R <= a[0] <= hub.HEMI_VB[0] - R and R <= a[1] <= hub.HEMI_VB[1] - R


def test_left_to_right_order_and_inner_arc():
    s = hub.hemi_slots(21)
    ang = [math.atan2(hub.HEMI_CY - y, x - hub.HEMI_CX) for x, y in s]
    assert all(a >= b - 1e-9 for a, b in zip(ang, ang[1:], strict=False))  # zleva doprava
    inner = [math.degrees(a) for (x, y), a in zip(s, ang, strict=True) if round(math.hypot(x - hub.HEMI_CX, hub.HEMI_CY - y)) == 114]
    assert round(max(inner)) == 154 and round(min(inner)) == 26


def test_number_and_label():
    num, fs = hub.hemi_number({"F": 15, "A": 3})
    assert fs == 68 and num.startswith('15<tspan class="hm-num-c"') and num.endswith(">3</tspan>")
    assert hub.hemi_number({"F": 10, "A": 11})[1] < 68  # pětimístné číslo menší, aby zůstalo v obdélníku
    c = {"F": 15, "A": 3, "B": 0, "N": 3}
    assert hub.hemi_label(c).startswith("Čeští poslanci: 15 pro, 3 proti, 3 nehlasovalo.")
