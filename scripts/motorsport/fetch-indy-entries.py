from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,urllib.request,re,hashlib
root=Path(__file__).resolve().parents[2]
research=root/'node_modules/.cache/motorsport-sources'
catalog=json.loads((root/'src/data/expansionCatalog2026.json').read_text(encoding='utf-8'))
calendar=catalog['calendars']['indycar']
directory=next(c for c in catalog['categories'] if c['id']=='indycar')['entries']
research.mkdir(parents=True,exist_ok=True)
seasonUrl='https://www.indycar.com/api/results/SeasonDropDown?id=b856a4f1-e85c-4fac-8c36-fd58d962227a'
rawSeason=urllib.request.urlopen(seasonUrl,timeout=45).read()
(research/'indy-season-api.json').write_bytes(rawSeason)
season=json.loads(rawSeason)[0]
def normalize(s):return re.sub(r'[^a-z0-9]','',s.lower())
def fetch(event):
    official=next(e for e in season['Events'] if normalize(e['EventName'])==normalize(event['raceName']))
    session=next(s for s in official['Sessions'] if s['SessionName']=='Race')
    url='https://www.indycar.com/api/results/EventsSessionDetails?id='+session['EventsSessionID']
    raw=urllib.request.urlopen(url,timeout=45).read()
    (research/(event['trackKey']+'-race-api.json')).write_bytes(raw)
    results=json.loads(raw)
    entries=[]
    for record in sorted(results['records'],key=lambda r:(r['PositionStart'] or 999,r['CarNumber'])):
        if record['IsDeleted']:continue
        name=re.sub(r'\\u([a-fA-F0-9]{4})',lambda m:chr(int(m[1],16)),record['DriverName'])
        matches=[e for e in directory if e['number']==record['CarNumber']]
        assert matches,(event['trackKey'],record['CarNumber'],name)
        entries.append({'number':record['CarNumber'],'name':name,'team':record['TeamName'],
          'engine':matches[0]['engine'],'grid':record['PositionStart'],'status':record['Status'],
          'bestLapTime':record['BestLapTime'],'laps':record['LapsComplete']})
    row={'courseId':event['trackKey'],'round':event['round'],'sourceUrl':url,'eventUrl':event['url'],
      'sha256':hashlib.sha256(raw).hexdigest(),'entries':entries}
    print(event['trackKey'],len(entries),flush=True)
    return row
with ThreadPoolExecutor(max_workers=6) as pool:rows=list(pool.map(fetch,calendar))
assert len(rows)==18
out={'schemaVersion':1,'scope':'2026 event race records and starting positions from official INDYCAR Results API; directory is retained independently','verifiedOn':'2026-10-07','events':rows}
(root/'src/data/indyEventEntries2026.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
