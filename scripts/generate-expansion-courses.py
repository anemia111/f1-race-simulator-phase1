"""Build expansion centerlines from reviewed OSM way chains (ODbL).

The snapshot stores source node identities and coordinates, not hand-drawn
vectors. Refresh explicitly with --refresh; validate and review the diff before
accepting an OSM change. No guessed control lines, banking or pits are produced.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "src/data/geodata/expansionCoursesOSM.json"
OUTPUT = ROOT / "src/data/expansionCourseLayouts.json"


def metres(a, b):
    rad = math.pi / 180
    lat1, lon1 = a
    lat2, lon2 = b
    h = math.sin((lat2-lat1)*rad/2)**2 + math.cos(lat1*rad)*math.cos(lat2*rad)*math.sin((lon2-lon1)*rad/2)**2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def build(course, ways):
    chain = []
    for item in course["chain"]:
        way = ways[str(item["wayId"])]
        points = way["points"][::-1] if item["reverse"] else way["points"]
        if chain and chain[-1][0] != points[0][0]:
            raise ValueError(f"{course['id']}: disconnected OSM way {item['wayId']}")
        chain.extend(points if not chain else points[1:])
    if chain[0][0] != chain[-1][0]:
        raise ValueError(f"{course['id']}: loop is not closed by the same OSM node")
    geo = [[p[1], p[2]] for p in chain]
    measured = sum(metres(a, b) for a, b in zip(geo, geo[1:]))
    deviation = abs(measured/course["publishedLengthMeters"]-1)
    if deviation > 0.04:
        raise ValueError(f"{course['id']}: length deviation {deviation:.2%} exceeds 4%")
    # Keep every surveyed vertex: no smoothing across chicanes/hairpins.
    # Coordinates are a local east/north metre frame, not renderer model units.
    lat0, lon0 = geo[0]
    local = [[round((lon-lon0)*math.pi/180*6371008.8*math.cos(lat0*math.pi/180), 3),
              round((lat-lat0)*math.pi/180*6371008.8, 3)] for lat, lon in geo[:-1]]
    return {**{k: v for k, v in course.items() if k != "chain"},
            "centerlineMeters": local, "measuredLengthMeters": round(measured, 3),
            "lengthDeviation": round(deviation, 6),
            "osmWayIds": [item["wayId"] for item in course["chain"]],
            "originLatLon": [lat0, lon0], "coordinateBasis": "local-east-north-metres",
            "controlLine": None, "pitLane": None, "banking": None, "elevation": None,
            "simulationReady": False,
            "notes": "OSM地図上の走路中心線。計測線・ピット・標高・バンク角・走行方向は未検証。レース実行用パックではありません。"}


def refresh(snapshot):
    # Fetch only reviewed ways. /ways/full is not a supported OSM endpoint;
    # each way/full response contains the required nodes and version metadata.
    updates = {}
    for way_id in snapshot["ways"]:
        url = f"https://api.openstreetmap.org/api/0.6/way/{way_id}/full"
        with urllib.request.urlopen(url, timeout=30) as response:
            root = ET.fromstring(response.read())
        nodes = {n.attrib["id"]: n for n in root.findall("node")}
        way = root.find("way")
        updates[way_id] = {"points": [[int(n.attrib["ref"]), float(nodes[n.attrib["ref"]].attrib["lat"]),
                                      float(nodes[n.attrib["ref"]].attrib["lon"])] for n in way.findall("nd")],
                           "url": url, "version": int(way.attrib["version"])}
    snapshot["ways"] = updates


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--as-of", help="Reviewed YYYY-MM-DD date; required with --refresh")
    args = parser.parse_args()
    if args.refresh and not args.as_of:
        parser.error("--refresh requires --as-of after reviewing the current source geometry")
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if args.refresh:
        refresh(snapshot)
        snapshot["verifiedOn"] = args.as_of
    layouts = [build(course, snapshot["ways"]) for course in snapshot["courses"]]
    snapshot_text = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n"
    result = {"schemaVersion": 1, "attribution": "© OpenStreetMap contributors (ODbL)",
              "licenseUrl": "https://www.openstreetmap.org/copyright",
              "snapshotSha256": hashlib.sha256(snapshot_text.encode()).hexdigest(), "layouts": layouts}
    if args.refresh:
        SNAPSHOT.write_text(snapshot_text, encoding="utf-8")
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for layout in layouts:
        print(f"{layout['id']}: {layout['measuredLengthMeters']:.1f} m / {layout['publishedLengthMeters']:.1f} m ({layout['lengthDeviation']:.2%})")


if __name__ == "__main__":
    main()
