"""Generate cached road elevation profiles, never queried during a race.
Run node scripts/export-elevation-targets.mjs first. Geographic input traces
only locate DEM observations; their scalar altitude properties are never used.
F1 traces: Tomislav Bacinger, MIT; expansion traces: OSM contributors, ODbL.
Existing national LiDAR/GSI profiles take precedence. Suzuka uses the official
July 2026 road longitudinal diagram (includes grade-separated crossing).
"""
import json,math,time,urllib.request,pathlib,hashlib
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
N=192
DATA=ROOT/'src/data'
CACHE=DATA/'geodata/elevationRequests.json'
cache=json.loads(CACHE.read_text(encoding='utf8')) if CACHE.exists() else {}
targets=json.loads((ROOT/'scripts/elevation-targets.json').read_text(encoding='utf8'))
geo=json.loads((DATA/'geodata/f1GeographicCenterlines.json').read_text(encoding='utf8'))
features={f['properties']['id']:f['geometry']['coordinates'] for f in geo['features']}
layouts={x['id']:x for x in json.loads((DATA/'expansionCourseLayouts.json').read_text(encoding='utf8'))['layouts']}
ids=dict(zip(['albert-park','shanghai','suzuka','bahrain','jeddah','miami','montreal','monaco','barcelona','red-bull-ring','silverstone','spa','hungaroring','zandvoort','monza','madrid','baku','singapore','cota','mexico-city','interlagos','las-vegas','lusail','yas-marina'],['au-1953','cn-2004','jp-1962','bh-2002','sa-2021','us-2022','ca-1978','mc-1929','es-1991','at-1969','gb-1948','be-1925','hu-1986','nl-1948','it-1922','es-2026','az-2016','sg-2008','us-2012','mx-1962','br-1940','us-2023','qa-2004','ae-2009']))
aliases={'fuji':'fuji-sf','suzuka':'suzuka-approx','sugo':'sugo-sf','autopolis':'autopolis-sf','motegi':'motegi-sf','spa':'spa-approx','interlagos':'interlagos-approx','cota':'cota-approx','barcelona':'barcelona-approx','monza':'monza-approx'}
def sample(points,n=N):
 p=np.array(points,dtype=float); p=np.concatenate([p,p[:1]]);ds=np.linalg.norm(np.diff(p,axis=0),axis=1);s=np.r_[0,np.cumsum(ds)];q=np.arange(n)/n*s[-1]
 return np.column_stack([np.interp(q,s,p[:,k]) for k in range(p.shape[1])])
def align(src,dst):
 a=sample(src);b=sample(dst);a0=a-a.mean(axis=0);b0=b-b.mean(axis=0);a0/=np.linalg.norm(a0);b0/=np.linalg.norm(b0);best=None
 for reverse in (False,True):
  ar=a0[::-1] if reverse else a0
  for shift in range(N):
   cand=np.roll(ar,-shift,axis=0);dot=(cand*b0).sum();cross=(cand[:,0]*b0[:,1]-cand[:,1]*b0[:,0]).sum();err=1-math.hypot(dot,cross)
   if best is None or err<best[0]:best=(err,reverse,shift)
 err,reverse,shift=best
 if err>.08:raise ValueError('shape alignment gate: '+str(err))
 return np.roll(a[::-1] if reverse else a,-shift,axis=0),{'error':round(err,7),'reversed':reverse,'shift':shift}
def elevations(coords,dataset):
 out=[]
 for start in range(0,len(coords),96):
  loc='|'.join(f'{lat:.7f},{lon:.7f}' for lat,lon in coords[start:start+96]);key=hashlib.sha256((dataset+loc).encode()).hexdigest()
  if key not in cache:
   req=urllib.request.Request('https://api.opentopodata.org/v1/'+dataset+'?interpolation=bilinear&locations='+loc,headers={'User-Agent':'race-simulator-elevation-generator/1.0'})
   for attempt in range(5):
    try:
     result=json.load(urllib.request.urlopen(req,timeout=40))
     if result.get('status')!='OK':raise ValueError(str(result))
     if any(r['elevation'] is None for r in result['results']):raise ValueError('No-data DEM station')
     cache[key]={'dataset':dataset,'locations':coords[start:start+96].tolist(),'results':result['results']};CACHE.write_text(json.dumps(cache,separators=(',',':')),encoding='utf8');break
    except Exception:
     if attempt==4:raise
     time.sleep(2*(attempt+1))
   time.sleep(1.1)
  out.extend(float(r['elevation']) for r in cache[key]['results'])
 # Remove isolated grid/vegetation spikes while retaining actual continuous gradients.
 a=np.array(out);a=np.median(np.vstack([np.roll(a,k) for k in (-1,0,1)]),axis=0)
 return sum(np.roll(a,k)*w for k,w in [(-2,1),(-1,2),(0,3),(1,2),(2,1)])/9
profiles={};failed=[]
for t in targets:
 id=t['id'];points=np.array(t['points']);length=t['lengthM']
 sparse_anchors=None
 try:
  if id in ('madrid-approx','baku-approx'):
   corners={c['number']:c for c in t['corners']}
   if id=='madrid-approx':
    p2,p7,p8=[corners[n]['progress'] for n in (2,7,8)]
    # Only T2/T7 are published absolute elevations. The climb base follows
    # the published 10m gain / 8%; T8 is inferred from the 5% descent.
    sparse_anchors=sorted([[p2,671],[(p7-125/length)%1,687],[p7,697],[p8,max(671,697-((p8-p7)%1)*length*.05)]])
    source='https://www.madring.com/en/circuit';basis='official-T2-T7-anchors-with-inferred-periodic-interpolation'
    registration={'officialElevationsM':{'T2':671,'T7':697},'inferredSegments':'8% climb gaining 10m; 5% descent; remaining road is interpolated, not surveyed'}
   else:
    sparse_anchors=sorted([[c['progress'],c['elevationM']] for c in t['corners'] if c['number']!=20 and c['elevationM'] is not None])
    source='user-supplied-corner-elevations';basis='unverified-user-corner-anchors-with-periodic-interpolation'
    registration={'excludedCorner':'T20=2m retained separately, suspected geographic mismatch','datum':'unverified; negative altitude is allowed'}
   a=np.array(sparse_anchors);heights=np.interp(np.arange(N)/N,np.r_[a[-1,0]-1,a[:,0],a[0,0]+1],np.r_[a[-1,1],a[:,1],a[0,1]]);coords=None
  elif id in aliases:
   original=profiles[aliases[id]];native=next(v for v in targets if v['id']==aliases[id]);aligned,registration=align(native['points'],points)
   # Determine progress from a native sample; alignment uses a rigid shape transform.
   _,rev,shift=(registration['error'],registration['reversed'],registration['shift'])
   heights=np.array(original['elevationsM']);heights=np.roll(heights[::-1] if rev else heights,-shift)
   source=original['sourceUrl'];basis=original['basis'];coords=None
  elif id=='suzuka-approx':
   official=json.loads((DATA/'geodata/suzukaOfficialElevation.json').read_text(encoding='utf8'));a=np.array(official['anchors']);# Register the road diagram's UNDER PASS / OVER PASS stations to the
   # two occurrences of the same physical crossing in the current layout.
   raw=np.array(t['points']);closed=np.r_[raw,raw[:1]];ds=np.linalg.norm(np.diff(closed,axis=0),axis=1);cum=np.r_[0,np.cumsum(ds)];cross=None
   for i in range(len(raw)):
    for j in range(i+2,len(raw)):
     if i==0 and j==len(raw)-1:continue
     d=closed[i+1]-closed[i];e=closed[j+1]-closed[j]
     try:r,v=np.linalg.solve(np.column_stack([d,-e]),closed[j]-closed[i])
     except np.linalg.LinAlgError:continue
     if 0<r<1 and 0<v<1:cross=((cum[i]+r*ds[i])/cum[-1],(cum[j]+v*ds[j])/cum[-1])
   if cross is None:raise ValueError('Suzuka must have its one grade-separated crossing')
   under,over=cross;su=(335.2677-32.2996826)/(813.5546875-32.2996826);so=(656.1547-32.2996826)/(813.5546875-32.2996826)
   q=np.arange(N)/N;registered=np.interp(q,[over-1,under,over,under+1],[so-1,su,so,su+1])%1
   heights=np.interp(registered,a[:,0],a[:,1]);source=official['sourceUrl'];basis=official['basis'];registration={'underpassProgress':under,'overpassProgress':over,'diagramUnderpassProgress':su,'diagramOverpassProgress':so};coords=None
  elif t.get('existing') and all(x is not None for x in t['existing']):
   heights=np.array(t['existing']);source='https://maps.gsi.go.jp/development/elevation_s.html' if id not in ('silverstone-approx','zandvoort-approx') else 'https://www.ahn.nl/dataroom' if id=='zandvoort-approx' else 'https://www.data.gov.uk/dataset/cf3f1137-c12b-44a1-a835-e80fe4a60b92/lidar-composite-digital-surface-model-dsm-1m';basis='existing-national-elevation-profile';registration=None;coords=None
  else:
   key=id.replace('-approx','');layout=layouts.get(id)
   if key in ids:
    ll=np.array(features[ids[key]])[:,:2];lat0=ll[:,1].mean();src=np.column_stack([ll[:,0]*math.cos(math.radians(lat0))*111195,ll[:,1]*111195]);aligned,registration=align(src,points);coords=np.column_stack([aligned[:,1]/111195,aligned[:,0]/(111195*math.cos(math.radians(lat0)))])
   elif layout and layout.get('originLatLon'):
    lat0,lon0=layout['originLatLon'];raw=np.array(layout['centerlineMeters']);aligned,registration=align(raw,points);coords=np.column_stack([lat0+aligned[:,1]/111195,lon0+aligned[:,0]/(111195*math.cos(math.radians(lat0)))])
   elif id=='arlington':
    street=json.loads((DATA/'geodata/arlington-streets.json').read_text(encoding='utf8'))
    way=next(w for w in street['elements'] if w['tags'].get('highway')=='raceway' and w['nodes'][0]==w['nodes'][-1]);ll=np.array([[p['lon'],p['lat']] for p in way['geometry']]);lat0=ll[:,1].mean();src=np.column_stack([ll[:,0]*math.cos(math.radians(lat0))*111195,ll[:,1]*111195]);aligned,registration=align(src,points);coords=np.column_stack([aligned[:,1]/111195,aligned[:,0]/(111195*math.cos(math.radians(lat0)))])
   elif id in ('detroit','washington-dc'):
    ref=json.loads((DATA/'geodata/streetElevationRegistration.json').read_text())[id];raw=np.array(layout['centerlineMeters']);origin=np.array(ref['originPixel']);delta=np.array([p[0] for p in ref['anchors']])-origin;delta[:,1]*=-1
    # Schematic is uniformly scaled to official length by the original generator.
    # Recover pixel/metre scale from its closed-loop extents.
    scale=(np.max(raw[:,0])-np.min(raw[:,0]))/(877 if id=='detroit' else 659)
    anchors=delta*scale;closed=np.r_[raw,raw[:1]];ds=np.linalg.norm(np.diff(closed,axis=0),axis=1);cum=np.r_[0,np.cumsum(ds)];positions=[]
    for point,(_,ll) in zip(anchors,ref['anchors']):
     best=None
     for i,(a,b) in enumerate(zip(closed,closed[1:])):
      d=b-a;r=np.clip(np.dot(point-a,d)/max(1e-9,np.dot(d,d)),0,1);err=np.linalg.norm(a+r*d-point)
      if best is None or err<best[0]:best=(err,(cum[i]+r*ds[i])/cum[-1],ll)
     positions.append(best)
    positions.sort(key=lambda x:x[1]);prog=np.array([x[1] for x in positions]);ll=np.array([x[2] for x in positions]);q=np.arange(N)/N
    coords=np.column_stack([np.interp(q,np.r_[prog[-1]-1,prog,prog[0]+1],np.r_[ll[-1,k],ll[:,k],ll[0,k]]) for k in (0,1)])
    # Re-register from original trace start to the current control line/direction.
    _,registration=align(raw,points);coords=np.roll(coords[::-1] if registration['reversed'] else coords,-registration['shift'],axis=0);registration['basis']='official-map road-junction registration; approximate between anchors'
   else:raise ValueError('Requires reviewed georeferencing of official map trace')
   dataset='ned10m,srtm30m' if coords[:,1].mean()<-60 and coords[:,0].mean()>20 else 'eudem25m,srtm30m' if -15<coords[:,1].mean()<40 and coords[:,0].mean()>35 else 'srtm30m'
   heights=elevations(coords,dataset);source='https://www.opentopodata.org/datasets/';basis='public-dem-road-estimate';registration={**registration,'dataset':dataset}
  grades=(np.roll(heights,-1)-np.roll(heights,1))/(2*length/N)
  if np.max(np.abs(grades))>.4:raise ValueError('Implausible gradient, review road/terrain separation')
  profiles[id]={'lengthM':length,'basis':basis,'sourceUrl':source,'registration':registration,'geometryFingerprint':hashlib.sha256(json.dumps(t['points'],separators=(',',':')).encode()).hexdigest(),'planarPoints':t['points'],'elevationsM':np.round(heights,3).tolist(),'grades':np.round(grades,6).tolist()}
  if sparse_anchors is not None:profiles[id]['anchors']=sparse_anchors
  print(id,round(float(heights.min()),1),round(float(heights.max()),1),flush=True)
 except Exception as e:failed.append({'id':id,'error':str(e)});print('REVIEW',id,str(e),flush=True)
(DATA/'courseElevations.json').write_text(json.dumps({'schemaVersion':1,'profiles':profiles,'unavailable':failed},separators=(',',':')),encoding='utf8')
print('TOTAL',len(profiles),'REVIEW',failed,flush=True)
