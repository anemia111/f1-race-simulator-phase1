import urllib.request,urllib.parse,json,pathlib,concurrent.futures
boxes={'detroit':(42.323,-83.055,42.337,-83.029),'arlington':(32.741,-97.101,32.756,-97.077),'washington-dc':(38.883,-77.027,38.895,-77.010)}
def run(pair):
 id,box=pair;p=pathlib.Path('src/data/geodata/'+id+'-streets.json')
 if not p.exists():
  q='[out:json][timeout:35];way[highway][name]('+','.join(map(str,box))+');out geom;'
  req=urllib.request.Request('https://overpass-api.de/api/interpreter?'+urllib.parse.urlencode({'data':q}),headers={'User-Agent':'race-simulator-georeference/1.0'})
  p.write_bytes(urllib.request.urlopen(req,timeout=45).read())
 j=json.loads(p.read_text(encoding='utf8'));print(id,sorted(set(e['tags']['name'] for e in j['elements'])))
with concurrent.futures.ThreadPoolExecutor(3) as ex:list(ex.map(run,boxes.items()))
