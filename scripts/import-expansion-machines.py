"""Import 2026 technical facts, independently of driver ratings.

Requires lxml and pypdf. No guessed aero coefficients or event BoP are generated.
The public SUPER GT overview is the source of its base technical figures;
manufacturer reference figures must not silently override this event-era data.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
import io
from pypdf import PdfReader
from lxml import html

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def numeric(text, unit, relation="published"):
    match = re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
    return {"value": float(match.group()) if match else None,
            "unit": unit, "relation": relation if match else "unavailable", "text": text}


def import_gt(item):
    raw = fetch(item["url"])
    root = html.fromstring(raw.decode("utf-8"))
    machines = []
    for table in root.xpath('//table[.//td[contains(.,"最低車重")]]'):
        title = " ".join(table.xpath(".//th")[0].text_content().split()).replace(" 主要スペック", "")
        rows = {" ".join(cells[0].text_content().split()): " ".join(cells[1].text_content().split())
                for tr in table.xpath(".//tr") if len(cells := tr.xpath("./td")) == 2}
        name = {"SUBARU BRZ": "SUBARU BRZ GT300",
                "Lamborghini HURACAN GT3 EVO2": "LAMBORGHINI HURACAN GT3 EVO2"}.get(title, title)
        category = "super-gt-gt500" if "GT500" in title or "PRELUDE" in title else "super-gt-gt300"
        size = next(value for key, value in rows.items() if "サイズ" in key)
        dimensions = re.findall(r"\d+(?:\.\d+)?", size)
        mass = next(value for key, value in rows.items() if "最低車重" in key)
        power = rows.get("最大馬力", "非公表")
        machines.append({"categoryId": category, "name": name, "sourceId": f"gt-spec-{item['id']}",
                         "mass": numeric(mass, "kg", "base-minimum"),
                         "length": numeric(dimensions[0], "mm"),
                         "width": numeric(dimensions[1], "mm"),
                         "height": numeric(dimensions[2] if len(dimensions) == 3 else "非公表", "mm"),
                         "wheelbase": numeric(rows["ホイールベース"], "mm"),
                         "displacement": numeric(rows["排気量"], "cc"),
                         "power": numeric(power, "PS", "lower-bound" if "以上" in power else "published"),
                         "gears": numeric("資料に記載なし", "count"), "engine": rows["エンジン型式"],
                         "architecture": rows["仕様"], "enginePosition": rows["エンジン搭載位置"],
                         "notes": "基本諸元。BoP・サクセスウェイト・燃料流量制限を反映した大会別の実効性能ではありません。"})
    if not machines:
        raise ValueError(f"No specification tables in {item['url']}")
    return machines, {"id": f"gt-spec-{item['id']}", "url": item["url"],
                      "sha256": hashlib.sha256(raw).hexdigest(), "scope": "2026 opening Okayama vehicle overview"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", required=True)
    args = parser.parse_args()
    search = "https://supergt.net/wp-json/wp/v2/search?" + urllib.parse.urlencode(
        {"search": "2026開幕特集", "per_page": 50})
    items = json.loads(fetch(search))
    items = [item for item in items if "super-gt" in item["url"] and "vol-" in item["url"]]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        imports = list(pool.map(import_gt, items))
    machines = [machine for group, _ in imports for machine in group]
    if len(machines) != 18 or len({(m["categoryId"], m["name"]) for m in machines}) != 18:
        raise ValueError("Expected exactly three GT500 and fifteen GT300 models")
    sources = [source for _, source in imports]
    # KCMG's vehicle weight is a manufacturer reference, not an established
    # regulatory minimum including a driver. Preserve the mass basis.
    kcmg_url = "https://www.kcmg-japan.com/kyojo/"
    raw = fetch(kcmg_url)
    text = " ".join(html.fromstring(raw.decode("utf-8")).text_content().split())
    for token in ["635kg", "176bhp", "2,753mm", "1,506mm", "6速"]:
        if token not in text:
            raise ValueError(f"KCMG specification changed: {token}")
    machines.append({"categoryId": "kyojo", "name": "KC-MG01", "sourceId": "kcmg-kc-mg01",
                     "mass": numeric("635", "kg", "manufacturer-vehicle-weight"),
                     "length": numeric("4150", "mm"), "width": numeric("1506", "mm"),
                     "height": numeric("980", "mm"), "wheelbase": numeric("2753", "mm"),
                     "displacement": numeric("1400", "cc", "rounded"),
                     "power": numeric("176", "bhp"), "gears": numeric("6", "count"),
                     "engine": "1.4 L turbo", "architecture": "1.4Lターボ", "enginePosition": None,
                     "notes": "KCMG公表の参考車両重量。適用年式とドライバー・燃料の算入条件は未確認。2026年はハイブリッド撤去のため、この値を2026年実戦重量とは扱わない。空力・タイヤ特性は未校正。"})
    sources.append({"id": "kcmg-kc-mg01", "url": kcmg_url,
                    "sha256": hashlib.sha256(raw).hexdigest(), "scope": "KC-MG01 manufacturer specification"})
    indy_url = "https://honda.racing/ja/indy-car-series/machines/car-specifications-26"
    raw = fetch(indy_url)
    text = " ".join(html.fromstring(raw.decode("utf-8")).text_content().split())
    for token in ["1630", "1620", "1590", "550-700", "HI22TT"]:
        if token not in text:
            raise ValueError(f"Honda specification changed: {token}")
    rule_url = "https://epaddock.indycar.com/docs/default-source/rules-regulations-and-policies/2026-indycar-rulebook.pdf?sfvrsn=56785b60_47"
    rule_raw = fetch(rule_url)
    rule_text = " ".join(" ".join(page.extract_text().split()) for page in PdfReader(io.BytesIO(rule_raw)).pages)
    for token in ["1785 pounds", "1740 pounds", "1770 pounds", "185 pounds"]:
        if token not in rule_text:
            raise ValueError(f"INDYCAR rulebook changed: {token}")
    sources.append({"id": "indy-rulebook-2026-0528", "url": rule_url,
                    "sha256": hashlib.sha256(rule_raw).hexdigest(), "scope": "2026-05-28 rulebook 14.4 car and driver equivalency mass"})
    for configuration, pounds in [("road-street", 1785), ("short-oval", 1770), ("speedway", 1740)]:
        machines.append({"categoryId": "indycar", "name": f"Dallara IR-18 / Honda / {configuration}",
                         "configuration": configuration, "engineSupplier": "Honda", "sourceId": "honda-ir18-2026",
                         "mass": numeric(str(pounds), "lb", "regulatory-minimum-excluding-driver-fuel"),
                         "massSourceId": "indy-rulebook-2026-0528", "driverEquivalencyPounds": 185,
                         "length": numeric("201.7", "in", "approximate"),
                         "width": numeric("76.5", "in", "upper-bound"),
                         "height": numeric("40", "in", "approximate"),
                         "wheelbase": {"value": 117.5, "upper": 121.5, "unit": "in", "relation": "range", "text": "117.5–121.5 in"},
                         "displacement": numeric("2200", "cc", "rounded"),
                         "power": {"value": 550, "upper": 700, "unit": "hp", "relation": "range", "text": "550–700 hp; circuit-dependent"},
                         "gears": numeric("6", "count"), "engine": "HI22TT", "architecture": "2.2 L V6 twin-turbo hybrid",
                         "enginePosition": None, "notes": "重量は2026年5月28日版規則14.4を優先。ドライバー・等価バラスト・燃料・飲料を除く。Honda紹介ページの旧概数1630/1620/1590 lbは走行重量に使いません。出力はHonda公表のサーキット依存範囲。"})
    sources.append({"id": "honda-ir18-2026", "url": indy_url,
                    "sha256": hashlib.sha256(raw).hexdigest(), "scope": "2026 Honda-powered IR-18 manufacturer reference"})
    # Shared chassis dimensions, not shared engine output. The supplier's
    # performance curve remains unavailable until an audited input is supplied.
    shared_url = "https://www.indycar.com/Fan-Info/INDYCAR-101/Additional-Updates"
    shared_raw = fetch(shared_url)
    shared_text = " ".join(html.fromstring(shared_raw.decode("utf-8")).text_content().split())
    for token in ["IR-12", "IR-18", "Chevrolet"]:
        if token not in shared_text:
            raise ValueError(f"Shared INDYCAR specification changed: {token}")
    sources.append({"id": "indy-shared-chassis", "url": shared_url,
                    "sha256": hashlib.sha256(shared_raw).hexdigest(), "scope": "IR-12 chassis / IR-18 aero and engine suppliers"})
    for original in list(machines):
        if original["categoryId"] != "indycar":
            continue
        variant = dict(original)
        variant.update({"name": original["name"].replace("Honda", "Chevrolet"),
                        "sourceId": "indy-shared-chassis", "engineSupplier": "Chevrolet",
                        "power": numeric("未確認", "kW"), "engine": "Chevrolet 2.2 L V6 twin-turbo",
                        "notes": "共通シャシーと2026規則重量。Chevrolet固有の出力曲線は未確認。Hondaの出力範囲を転用しません。"})
        machines.append(variant)
    toyota_url = "https://toyota-racing.com/toyota-racing-wec/"
    raw = fetch(toyota_url)
    text = " ".join(html.fromstring(raw.decode("utf-8")).text_content().split())
    for token in ["TR010", "Length4900mm", "Weight *1040kg", "Hybrid power200 kW", "Engine power*520 kW"]:
        if token not in text:
            raise ValueError(f"Toyota technical specification changed: {token}")
    machines.append({"categoryId": "wec-hypercar", "name": "Toyota TR010 Hybrid", "sourceId": "toyota-tr010-2026",
                     "mass": numeric("1040", "kg", "manufacturer-reference-subject-to-bop"),
                     "length": numeric("4900", "mm"), "width": numeric("2000", "mm"),
                     "height": numeric("1150", "mm"), "wheelbase": numeric("未公表", "mm"),
                     "displacement": numeric("3500", "cc", "rounded"),
                     "power": numeric("520", "kW", "manufacturer-reference-subject-to-bop"),
                     "gears": numeric("7", "count"), "engine": "V6 twin-turbo", "architecture": "3.5 L V6 direct injection twin-turbo hybrid",
                     "enginePosition": None, "notes": "2026 TR010メーカー諸元。重量・出力はBoP依存。200 kWの前輪モーターを520 kWに足して720 kWとして扱いません。大会別BoPと展開条件が必要です。"})
    sources.append({"id": "toyota-tr010-2026", "url": toyota_url,
                    "sha256": hashlib.sha256(raw).hexdigest(), "scope": "2026 TR010 technical specifications; weight/power subject to BoP"})
    for source in sources:
        source["verifiedOn"] = args.as_of
    machines.sort(key=lambda machine: (machine["categoryId"], machine["name"]))
    result = {"schemaVersion": 1, "season": 2026, "verifiedOn": args.as_of,
              "machines": machines, "sources": sources}
    (ROOT / "src/data/expansionMachineSpecs2026.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(machines)} technical variants from {len(sources)} primary sources")


if __name__ == "__main__":
    main()
