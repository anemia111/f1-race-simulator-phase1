"""Import the user-authored CSV without recalculating any ability.

Usage: python scripts/import-driver-ratings.py path/to/ratings.csv
The original cells and hash remain in the JSON; instructions in cells are data.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = {
    "adaptability": "Adaptability", "consistency": "Consistency",
    "defending": "Defending", "errorControl": "Error control",
    "experience": "Experience", "overtaking": "Overtaking",
    "qualifyingPace": "Qualifying pace", "racePace": "Race pace",
    "raceStart": "Race start", "technicalFeedback": "Technical feedback",
    "tyreManagement": "Tyre management", "wetSkill": "Wet skill",
}
SERIES = {"F1": "f1-custom", "F1 (Simulator Custom)": "f1-custom",
          "SUPER FORMULA": "super-formula", "F2": "f2", "F3": "f3",
          "KYOJO CUP": "kyojo", "IndyCar": "indycar",
          "SUPER GT GT500": "super-gt-gt500", "SUPER GT GT300": "super-gt-gt300",
          "WEC Hypercar": "wec-hypercar", "WEC LMGT3": "wec-lmgt3"}


def normalise(name):
    return "".join(c for c in unicodedata.normalize("NFKD", name).casefold()
                   if c.isalnum() and not unicodedata.combining(c))


def number(value, label):
    result = float(value)
    if not 0 <= result <= 120:
        raise ValueError(f"Invalid {label}: {value}")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    args = parser.parse_args()
    raw = args.csv_path.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    series_data = json.loads((ROOT / "src/data/motorsportSeries2026.json").read_text(encoding="utf-8"))
    historical = json.loads((ROOT / "src/data/historicalDriverPool2026.json").read_text(encoding="utf-8"))["drivers"]
    # The F1 source contains a second, different machine table. Stop at it.
    f1_text = (ROOT / "src/data/f1Performance.csv").read_text(encoding="utf-8-sig").split("TEAM MACHINE ABILITIES")[0]
    f1 = [{"id": r["Driver ID"], "name": r["Driver"], "code": r["Code"], "nationality": r["Nationality"]}
          for r in csv.DictReader(io.StringIO(f1_text)) if r.get("Driver")]
    existing = f1 + historical + series_data["reserves"] + [
        d for s in series_data["series"] for t in s.get("teams", []) for d in t["drivers"]]
    identities = {}
    for d in existing:
        key = normalise(d["name"])
        if key in identities and identities[key]["id"] != d["id"]:
            raise ValueError(f"Ambiguous existing identity: {d['name']}")
        identities[key] = d
    # Reviewed spelling variants only; no fuzzy or surname-only merging.
    for name, driver_id in {"Juju Noda": "juju_noda", "Joshua Dürksen": "joshua_duerksen",
                            "Noah Strømsted": "noah_stromsted"}.items():
        identities[normalise(name)] = next(d for d in existing if d["id"] == driver_id)
    seen_names, seen_ids, drivers = set(), set(), []
    for index, row in enumerate(rows, 2):
        name = row["Driver"].strip()
        key = normalise(name)
        if not key or key in seen_names:
            raise ValueError(f"Duplicate or empty identity on line {index}")
        seen_names.add(key)
        current = identities.get(key)
        driver_id = current["id"] if current else "expansion_" + re.sub(
            r"[^a-z0-9]+", "_", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("_")
        if driver_id in seen_ids or driver_id == "expansion_":
            raise ValueError(f"Ambiguous driver ID on line {index}: {name}")
        seen_ids.add(driver_id)
        source_series = [SERIES[s.strip()] for s in row["2026 Series"].split(";")]
        overall = number(row["WORLD_OVR"], "WORLD_OVR")
        potential = number(row["Potential"], "Potential") if row["Potential"].strip() else None
        ratings = {k: number(row[c], c) / 100 for k, c in COLUMNS.items()}
        drivers.append({"id": driver_id, "name": name, "code": current["code"] if current else
                        re.sub(r"[^A-Z]", "", name.upper().split()[-1])[:3] or "DRV",
                        "nationality": current["nationality"] if current else "UNK",
                        "overall": overall, "potential": potential, "ratings": ratings,
                        "seriesIds": source_series, "sourceRow": index, "raw": row})
    document = {"schemaVersion": 1, "sourceFile": args.csv_path.name,
                "sourceDate": "2026-10-07", "sha256": hashlib.sha256(raw).hexdigest(),
                "existingRatingPolicy": "preserve-existing-authored-values",
                "missingPotentialPolicy": "retain-null-in-source-use-overall-for-new-runtime-driver",
                "drivers": drivers}
    target = ROOT / "src/data/importedDriverRatings2026.json"
    target.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(drivers), "existingMatches": sum(normalise(r["name"]) in identities for r in drivers),
                      "missingPotential": sum(r["potential"] is None for r in drivers), "sha256": document["sha256"]}))


if __name__ == "__main__":
    main()
