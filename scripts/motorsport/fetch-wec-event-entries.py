from pathlib import Path
import urllib.request,json,re,hashlib,pdfplumber
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parents[2]
cache=root/'node_modules/.cache/motorsport-sources'
cache.mkdir(parents=True,exist_ok=True)
def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=50).read()
base='https://www.fiawec.com'
html=get(base+'/en/race/6-hours-of-fuji-2026')
soup=BeautifulSoup(html,'html.parser')
urls=list(dict.fromkeys(base+a['href'] for a in soup.select('a[href]') if a['href'].startswith('/en/race/') and '/document/' not in a['href']))
print(urls,flush=True)
events=[]
for url in urls:
 if '2026' not in url:continue
 try:
  page=BeautifulSoup(get(url),'html.parser')
  links=[a for a in page.select('a[href]') if 'ENTRY LIST' in a.get_text(' ',strip=True).upper()]
  if not links:print('No list',url,flush=True);continue
  href=links[0]['href']; pdfurl=href if href.startswith('http') else base+href
  data=get(pdfurl)
  if not data.startswith(b'%PDF'):print('Not PDF',pdfurl,flush=True);continue
  name=url.rsplit('/',1)[-1]
  path=cache/(name+'-entries.pdf');path.write_bytes(data)
  entries=[];cls=None
  for p in pdfplumber.open(path).pages:
   for table in p.extract_tables():
    driver_columns=[i for i,cell in enumerate(table[0]) if cell and str(cell).startswith('DRIVER ')]
    car_column=next((i for i,cell in enumerate(table[0]) if cell=='CARS'),4)
    for row in table:
     row=[(s or '').replace('\n',' ').strip() for s in row]
     header=' '.join(row)
     if 'HYPERCAR COMPETITORS' in header:cls='hypercar'
     elif 'LMGT3 COMPETITORS' in header:cls='lmgt3'
     elif 'LMP2 COMPETITORS' in header:cls='lmp2'
     if cls and re.fullmatch(r'\d{1,3}',row[0]) and len(row)>=10:
      drivers=[]
      for i in driver_columns:
       if i>=len(row):continue
       raw=row[i]
       if raw in ['','-']:continue
       m=re.fullmatch(r'(.+?)(?:\s*\(([A-Z]{3})\))?',raw)
       drivers.append({'name':m[1].strip(),'nationality':m[2],'grade':row[i+1] if len(row)>i+1 else ''})
      entries.append({'number':row[0],'team':row[1],'machine':row[car_column],'classId':cls,'drivers':drivers})
  assert len(entries) in [35,62],(url,len(entries))
  assert len(set(e['number'] for e in entries))==len(entries)
  events.append({'eventUrl':url,'sourceUrl':pdfurl,'sha256':hashlib.sha256(data).hexdigest(),'entries':entries})
  print(name,len(entries),[len(e['drivers']) for e in entries],flush=True)
 except Exception as e:print('ERROR',url,str(e),flush=True)
(root/'src/data/wecEventEntries2026.json').write_text(json.dumps({'schemaVersion':1,'verifiedOn':'2026-10-07','events':events},ensure_ascii=False,indent=2),encoding='utf-8')
