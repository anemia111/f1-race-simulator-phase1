from pathlib import Path
import json,re,math,hashlib,pdfplumber
root=Path(__file__).resolve().parents[2]
data=root/'src/data'
research=root/'node_modules/.cache/motorsport-sources'
events=json.loads((research/'indy-event-distances.json').read_text())
assert len(events)==18 and all(row['laps'] for row in events),events
pack={'schemaVersion':1,'verifiedOn':'2026-10-07','indycar':events}
(data/'motorsportEventFormats2026.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2),encoding='utf-8')
p=pdfplumber.open(research/'lemans-entries-v2.pdf').pages[0]
# Read cells by coordinates: PDF text stream puts car numbers after the table.
def cell(y,x0,x1):
    chars=[c for c in p.chars if x0<=c['x0']<x1 and abs(c['top']-y)<1]
    return ''.join(c['text'] for c in sorted(chars,key=lambda c:c['x0'])).strip()
ys=sorted(set(round(c['top'],2) for c in p.chars if 211<c['x0']<283 and 66<c['top']<475))
rows=[]
for y in ys:
    number=cell(y,194,208)
    if not re.fullmatch(r'\d{1,3}',number):continue
    drivers=[]
    for x0,x1,g0,g1 in [(420,495,497,504),(505,575,577,584),(585,654,655,663)]:
        raw=cell(y,x0,x1)
        m=re.fullmatch(r'(.+?)(?:\s*\(([A-Z]{3})\))?',raw)
        assert m,(y,raw)
        drivers.append({'name':m[1].strip(),'nationality':m[2],'grade':cell(y,g0,g1)})
    cls='hypercar' if y<181 else 'lmp2' if y<309 else 'lmgt3'
    rows.append({'number':number,'team':cell(y,210,283),'machine':cell(y,323,396),'classId':cls,'drivers':drivers,'proAm':'Pro-Am' in cell(y,398,420)})
assert len(rows)==62,(len(rows),[row['number'] for row in rows])
assert [sum(r['classId']==c for r in rows) for c in ['hypercar','lmp2','lmgt3']]==[18,19,25]
assert len(set(row['number'] for row in rows))==62
assert all(len(r['drivers'])==3 and all(d['grade'] in ['P','G','S','B'] for d in r['drivers']) for r in rows)
out={'schemaVersion':1,'scope':'2026 Le Mans published provisional entry list V2; six reserves excluded; not final race starters','sourceUrl':'https://www.fiawec.com/umbrella_media/2026-fia-wec-24-hours-of-le-mans-provisional-entry-list-v2-69fb6029c5ffd268710129.pdf','sha256':hashlib.sha256((research/'lemans-entries-v2.pdf').read_bytes()).hexdigest(),'entries':rows}
(data/'lemansEntries2026.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print('Entry list',len(rows),[r['number'] for r in rows])
# Trace the centre of the official black route in the 1823x1367 rendered maps.
# These are schematic map-derived shapes, not surveyed road coordinates.
traces={
 'detroit':[(820,704),(470,704),(470,738),(614,738),(614,914),(700,914),(735,955),(1018,955),(1018,853),(1335,853),(1347,704)],
 'washington-dc':[(1152,755),(1152,593),(500,354),(493,362),(493,534),(646,534),(646,968),(1020,968),(1045,967),(1062,960),(1080,940),(1100,926),(1152,909)],
 'arlington':[(909,678),(905,550),(896,530),(883,518),(845,514),(828,505),(821,491),(821,445),(815,422),(804,407),(788,402),(700,425),(500,460),(365,460),(351,470),(350,490),(386,548),(396,570),(390,583),(377,591),(364,591),(350,583),(330,551),(303,531),(270,520),(235,513),(209,520),(189,535),(177,556),(171,579),(171,608),(182,643),(203,672),(203,682),(153,703),(118,705),(110,694),(108,532),(111,493),(121,476),(145,464),(260,451),(500,440),(680,420),(795,391),(869,385),(1020,385),(1065,395),(1210,425),(1240,430),(1560,425),(1588,433),(1604,452),(1610,485),(1610,589),(1605,615),(1560,715),(1490,840),(1440,910),(1420,926),(1405,930),(1386,923),(1310,880),(1260,859),(1210,848),(1170,845),(910,845),(894,839),(886,826),(887,810),(902,779),(916,752),(920,731),(920,650)],
}
layouts=json.loads((data/'expansionCourseLayouts.json').read_text(encoding='utf-8'))
derived=[]
for id,vertices in traces.items():
    # Round schematic sharp junctions with quadratic corner segments, then
    # scale to official lap length. Local radii remain approximations.
    points=[]
    for i,v in enumerate(vertices):
        prev=vertices[(i-1)%len(vertices)];nxt=vertices[(i+1)%len(vertices)]
        a=math.dist(prev,v);b=math.dist(v,nxt);cut=min(6,a*.15,b*.15)
        before=[v[j]+(prev[j]-v[j])*cut/a for j in range(2)]
        after=[v[j]+(nxt[j]-v[j])*cut/b for j in range(2)]
        for k in range(5):
            t=k/4
            points.append([(1-t)**2*before[j]+2*(1-t)*t*v[j]+t*t*after[j] for j in range(2)])
    perimeter=sum(math.dist(v,points[(i+1)%len(points)]) for i,v in enumerate(points))
    event=next(e for e in events if e['courseId']==id)
    length=event['lengthMiles']*1609.344
    origin=points[0];scale=length/perimeter
    route=[[round((v[0]-origin[0])*scale,3),round((origin[1]-v[1])*scale,3)] for v in points]
    mapurl='https://www.indycar.com'+event['maps'][0]
    derived.append({'id':id,'publishedLengthMeters':length,'lengthSourceUrl':event['url'],'geometrySourceUrl':mapurl,'geometryBasis':'official-map-trace','centerlineMeters':route,'measuredLengthMeters':length,'lengthDeviation':0,'osmWayIds':[],'originLatLon':None,'coordinateBasis':'official schematic pixel trace scaled to published lap length; local curvature approximate','controlLine':None,'pitLane':None,'banking':None,'elevation':None,'simulationReady':False,'notes':'公式コース図の走路をトレースした閉ループ。全長は公表値に整合。局所曲率・計測線・ピット・幅員は測量値ではありません。'})
layouts['layouts']=[l for l in layouts['layouts'] if l['id'] not in traces]+derived
(data/'expansionCourseLayouts.json').write_text(json.dumps(layouts,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Traced routes',[(d['id'],len(d['centerlineMeters'])) for d in derived])
