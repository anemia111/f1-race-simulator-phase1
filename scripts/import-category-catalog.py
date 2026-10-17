# Run from the repository root. Requires: python -m pip install beautifulsoup4
# Collects factual entry/profile fields only; no images, logos, biographies or textures.
# Source HTML is cached outside the source tree for audit and reproducibility.
import sys, json, re, urllib.request, hashlib
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(Path('../../work/catalog-libs').resolve()))
from bs4 import BeautifulSoup
cache=Path('../../work/catalog-source-cache');cache.mkdir(exist_ok=True)
def fetch(url):
 key=hashlib.sha256(url.encode()).hexdigest();p=cache/(key+'.html')
 if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=30).read())
 return BeautifulSoup(p.read_bytes(),'html.parser',from_encoding='utf-8')
def text(n):return n.get_text(' ',strip=True) if n else ''
def record(number,team,car,drivers,url):return dict(number=str(number),team=team,car=car,drivers=drivers,url=url)
def category(id,label,url,note):return dict(id=id,label=label,season=2026,checkedAt='2026-10-17',sourceUrl=url,note=note,entries=[])
result=[]
for cls in ['gt500','gt300']:
 url='https://supergt.net/teams_and_drivers?gt_class='+cls+'&series=2026';soup=fetch(url)
 cat=category(cls,'SUPER GT '+cls.upper(),url,'2026シリーズエントリー掲載情報。大会ごとの追加・交代は公式ページで確認。')
 for bib in soup.select('table.drivers_teams .bib'):
  row=bib.find_parent('tr');dd=row.select('.team_machine dd');names=[text(n) for n in row.select('.driver_icon')]
  cat['entries'].append(record(text(bib),text(dd[0]),text(dd[1]),names,url))
 assert len(cat['entries'])>=14 if cls=='gt500' else len(cat['entries'])>=25
 result.append(cat)
url='https://www.indycar.com/Drivers';soup=fetch(url);cat=category('indycar','INDYCAR',url,'2026公式ドライバー一覧。スポット参戦を含み、全員が全戦出走する意味ではありません。')
for card in soup.select('a.driver-card'):
 names=text(card.select_one('.driver-card-identity-name-container'))
 logos=card.select('.driver-card-logo-item');team=logos[0].get('alt','').removesuffix(' logo') if logos else ''
 number=card.select_one('.driver-card-image-endplate').get('alt','').replace('Endplate for ','')
 cat['entries'].append(record(number,team,'', [names],urljoin(url,card['href'])))
assert len(cat['entries'])>=25;result.append(cat)
url='https://kyojocup.jp/profile/';soup=fetch(url);cat=category('kyojo','KYOJO CUP',url,'2026公式プロフィール掲載者。マシン名は各プロフィールの掲載表記。')
links=[urljoin(url,n['href']) for n in soup.select('.driver_list a')]
def kyojo(link):
 s=fetch(link);main=s.select_one('main');title=main.select_one('h2')
 details={text(dl.select_one('dt')):text(dl.select_one('dd')) for dl in main.select('dl')}
 name=text(title) or text(main.select_one('h1'))
 # English profile name is also indexed in the listing; keep that spelling.
 name=text(next(n for n in soup.select('.driver_list a') if urljoin(url,n['href'])==link).select_one('figcaption'))
 return record(details.get('ゼッケン',''),'',details.get('マシン名',''),[name],link)
with ThreadPoolExecutor(max_workers=4) as pool:cat['entries']=list(pool.map(kyojo,links))
assert len(cat['entries'])==20;result.append(cat)
url='https://www.fiawec.com/en/page/grid';soup=fetch(url);cards=soup.select('.card-team');cat=category('wec','FIA WEC',url,'2026公式グリッドのHypercar / LMGT3。ドライバーは各車両詳細ページ掲載者。')
links=[]
for card in cards:
 a=card.select_one('a[href*="/car/2026/"]')
 if a:links.append((urljoin(url,a['href']),text(a),text(card)))
def wec(item):
 link,team,info=item;s=fetch(link)
 names=[text(n) for n in s.select('a.card-driver')]
 main=s.select_one('main');dt=main.find(string=lambda v:v and v.strip()=='Car')
 car=''
 if dt:
  parent=dt.parent
  for sib in parent.next_siblings:
   if hasattr(sib,'get_text') and text(sib):car=text(sib);break
 number=link.rsplit('/',1)[1];entry=record(number,team,car,names,link)
 entry['className']='LMGT3' if 'LMGT3' in info else 'Hypercar'
 assert names,link
 return entry
with ThreadPoolExecutor(max_workers=4) as pool:cat['entries']=list(pool.map(wec,links))
assert len(cat['entries'])>=30;result.append(cat)
Path('src/data/categoryCatalog2026.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print([(c['id'],len(c['entries'])) for c in result])
