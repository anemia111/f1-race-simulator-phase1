from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, re, urllib.request, hashlib
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parents[2]
out=root/'node_modules/.cache/motorsport-sources'
out.mkdir(parents=True,exist_ok=True)
catalog=json.loads((root/'src/data/expansionCatalog2026.json').read_text(encoding='utf-8'))
events=catalog['calendars']['indycar']
def get(event):
    url=event['url']
    data=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=45).read()
    (out/(event['trackKey']+'.html')).write_bytes(data)
    soup=BeautifulSoup(data,'html.parser')
    text=soup.get_text(' ',strip=True)
    m=re.search(r'Race Distance\s+(\d+)\s+Laps',text)
    length=re.search(r'Track Length\s+([\d.]+)\s+Miles',text)
    maps=[a.get('href') for a in soup.find_all('a') if 'Official Track Map' in a.get_text()]
    row={'courseId':event['trackKey'],'laps':int(m[1]) if m else None,'lengthMiles':float(length[1]) if length else None,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'maps':maps}
    print(json.dumps(row),flush=True)
    return row
with ThreadPoolExecutor(max_workers=6) as pool:
    rows=list(pool.map(get,events))
(out/'indy-event-distances.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
downloads={
 'lemans-entries-v2.pdf':'https://www.fiawec.com/umbrella_media/2026-fia-wec-24-hours-of-le-mans-provisional-entry-list-v2-69fb6029c5ffd268710129.pdf',
 'arlington-map.jpg':'https://www.indycar.com/-/media/IndyCar/Schedules/TrackMaps/Arlington_TrackMap.jpg',
 'detroit-map.jpg':'https://www.indycar.com/-/media/IndyCar/Schedules/TrackMaps/Detroit_TrackMap.jpg',
 'washington-dc-map.jpg':'https://www.indycar.com/-/media/IndyCar/Schedules/TrackMaps/WashingtonDC-TrackMap.jpg',
}
for name,url in downloads.items():
    data=urllib.request.urlopen(url,timeout=45).read()
    (out/name).write_bytes(data)
    print(name,len(data),hashlib.sha256(data).hexdigest(),flush=True)
