from pathlib import Path
import json,copy
p=Path(__file__).resolve().parents[2]/'src/data/expansionMachineSpecs2026.json';x=json.loads(p.read_text(encoding='utf-8'))
def q(v,u,r='manufacturer-reference-subject-to-bop'):
 return {'value':v,'unit':u,'relation':r if v is not None else 'unavailable','text':str(v) if v is not None else 'Not published in reviewed source'}
def add(name,category,source,url,mass=None,power=None,powerunit='kW',gears=None,length=None,width=None,height=None,wb=None,cc=None,engine='',hybrid=None):
 if any(m['name']==name and m['categoryId']==category for m in x['machines']):return
 x['sources'].append({'id':source,'url':url,'retrievedOn':'2026-10-07','scope':'Manufacturer reference, not a verified 2026 event BoP or surveyed performance map'})
 x['machines'].append({'categoryId':category,'name':name,'sourceId':source,'mass':q(mass,'kg'),'power':q(power,powerunit),'gears':q(gears,'count','published'),'length':q(length,'mm','published'),'width':q(width,'mm','published'),'height':q(height,'mm','published'),'wheelbase':q(wb,'mm','published'),'displacement':q(cc,'cc','published'),'engine':engine,'architecture':engine,'enginePosition':None,'notes':'Individual manufacturer reference. Missing parameters remain unavailable. Combined output is BoP dependent; hybrid is not added to the cap.',**({'hybridPowerKw':hybrid} if hybrid is not None else {})})
add('Alpine A424','wec-hypercar','alpine-a424-reference','https://www.alpinecars.fr/championnat-wec/alpine-a424.html',1030,500,gears=7,length=5088,width=1992,height=1055,wb=3148,cc=3400,engine='90 degree single-turbo V6',hybrid=50)
add('Genesis GMR-001-Hypercar','wec-hypercar','genesis-gmr001-2026','https://motorsport.hyundai.com/Corporate%20Site/Car%20Spec/GMR-001/2026_Genesis_CarSpec_2026.pdf',1030,680,'hp',7,5000,2000,None,3150,3200,'G8MR turbo V8',50)
add('Peugeot 9X8','wec-hypercar','peugeot-9x8-reference-2024','https://peugeot-sport.com/wp-content/uploads/2024/11/fiche-technique-2024-9x8-1.pdf',1030,None,gears=7,length=4995,width=2000,height=1145,cc=2600,engine='90 degree twin-turbo V6',hybrid=200)
# Peugeot publishes ICE480..520kW rather than a fixed combined event output.
add('Cadillac V-Series.R','wec-hypercar','cadillac-vseriesr-reference','https://www.cadillac.com/racing/imsa',None,670,'hp',7,cc=5500,engine='Naturally aspirated DOHC V8 hybrid')
add('BMW M Hybrid V8','wec-hypercar','bmw-mhybridv8-2026','https://www.bmw-m.com/de/fastlane/motorsport/race-cars/bmw-m-hybrid-v8.html',cc=3999,engine='P66/3 twin-turbo V8; published 640PS is ICE-only, not combined output')
add('Aston Martin Valkyrie','wec-hypercar','aston-valkyrie-race-reference','https://www.astonmartinf1.com/en-GB/news/announcement/aston-martin-valkyrie-unveiled-as-le-mans-hypercar',gears=7,cc=6500,engine='Cosworth naturally aspirated V12; road-car 1000bhp does not apply',hybrid=0)
add('Ferrari 499P','wec-hypercar','ferrari-499p-reference','https://www.ferrari.com/en-EN/hypercar/ferrari-499p',engine='Manufacturer page requires interactive verification; no Modificata values imported')
add('Oreca 07 - Gibson','wec-lmp2','oreca07-reference','https://www.oreca.com/wp-content/uploads/2021/08/Media_Kit_2021_EN.pdf',950,length=4745,width=1895,height=1045,wb=3005,cc=4200,engine='Gibson GK-428 naturally aspirated 90 degree V8')
for name,original in [('Aston Martin Vantage AMR LMGT3','Aston Martin Vantage GT3 EVO'),('BMW M4 LMGT3 Evo','BMW M4 GT3 EVO'),('Ferrari 296 LMGT3 Evo','FERRARI 296 GT3 EVO'),('Lexus RC F LMGT3','LEXUS RC F GT3'),('Mercedes-AMG LMGT3','Mercedes AMG GT3'),('Porsche 911 GT3 R LMGT3','PORSCHE 911 GT3R EVO')]:
 if any(a['name']==name and a['categoryId']=='wec-lmgt3' for a in x['machines']):continue
 m=copy.deepcopy(next(a for a in x['machines'] if a['name']==original));m['name']=name;m['categoryId']='wec-lmgt3';m['notes']='GT3 base manufacturer reference only. LMGT3 homologation/BoP may differ. '+m['notes'];x['machines'].append(m)
add('Corvette Z06 LMGT3.R','wec-lmgt3','corvette-gt3r-reference','https://www.chevroletjapan.com/racing',gears=6,cc=5500,engine='LT6 DOHC flat-plane V8; manufacturer 500..600hp range is BoP dependent')
add('McLaren 720S LMGT3 Evo','wec-lmgt3','mclaren-gt3-reference','https://cars.mclaren.com/en/customer-racing/720s-gt3',engine='GT3 Evo base model; no road-car output imported')
add('Ford Mustang LMGT3','wec-lmgt3','ford-gt3-reference','https://performance.ford.com/vehicles/mustang-gt3',engine='GT3 race model; reference values pending official specification')
p.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
print('Technical reference models',len(x['machines']))
