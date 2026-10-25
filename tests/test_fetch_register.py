import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_register as fr  # noqa: E402
from compute_stats import FormatError  # noqa: E402


def org(code, country, cat="Companies & groups", extra=""):
    return (
        f"<interestRepresentative><identificationCode>{code}</identificationCode><registrationDate>2024-01-02T10:00:00Z</registrationDate>"
        f"<name><originalName>MOCK {code}{extra}</originalName></name><registrationCategory>{cat.replace('&', '&amp;')}</registrationCategory>"
        f"<headOffice><address>MOCK ulice 1</address><country>{country}</country></headOffice><webSiteURL>mock.example</webSiteURL>"
        "</interestRepresentative>"
    )


def xml(*orgs):
    return (
        "<?xml version='1.1' encoding='UTF-8'?><ListOfIRPublicDetail><metaData><exportDate>2026-10-24T20:00:00Z</exportDate>"
        f"<numberOfIR>{len(orgs)}</numberOfIR></metaData><resultList>{''.join(orgs)}</resultList></ListOfIRPublicDetail>"
    )


def test_only_czech_orgs_without_contacts_and_xml11_chars():
    doc = fr.parse(
        xml(org("1", "CZECH REPUBLIC", extra="&#1;"), org("2", "SPAIN"), org("3", "CZECH REPUBLIC", "Self-employed individuals"))
    )
    assert doc["export_date"] == "2026-10-24" and doc["total_register"] == 3
    assert [o["id"] for o in doc["organisations"]] == ["1"]
    o = doc["organisations"][0]
    assert o["name"] == "MOCK 1" and o["category_cs"] == "Společnosti a skupiny" and "address" not in o
    assert o["url"].endswith("?id=1")


def test_unknown_category_and_missing_field_fail():
    with pytest.raises(FormatError):
        fr.parse(xml(org("1", "CZECH REPUBLIC", "MOCK nová kategorie")))
    with pytest.raises(FormatError):
        fr.parse(xml("<interestRepresentative><identificationCode>9</identificationCode></interestRepresentative>"))
