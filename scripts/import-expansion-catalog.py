"""Import factual 2026 identities, without inventing executable vehicle/rule packs.

Requires lxml and pypdf. Run with --as-of YYYY-MM-DD; review the resulting diff.
The event-scoped WEC list is deliberately not labelled a full-season roster.
"""
import argparse
import hashlib
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from lxml import html
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--as-of', required=True)
args = parser.parse_args()
if not re.fullmatch(r'2026-\d{2}-\d{2}', args.as_of):
    raise ValueError('Expected a 2026 ISO date')
sources = []

def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'FormulaRaceSimulator/2026 source-audit'}), timeout=45) as response:
        return response.read()

def record(source_id, url, raw, scope):
    sources.append(dict(id=source_id, url=url, verifiedOn=args.as_of,
                        sha256=hashlib.sha256(raw).hexdigest(), scope=scope))

def document(source_id, url, scope='2026 official directory snapshot'):
    raw = fetch(url)
    record(source_id, url, raw, scope)
    return html.fromstring(raw)

def text(node):
    return ' '.join(node.text_content().split())

def cls(name):
    return f'contains(concat(" ", normalize-space(@class), " "), " {name} ")'

def elements(node, name):
    return node.xpath(f'.//*[{cls(name)}]')

def value(node, name):
    matches = elements(node, name)
    return text(matches[0]) if matches else None

def entry(number, team, machine, drivers, source_id, **extra):
    return dict(number=str(number), team=team, machine=machine, drivers=drivers,
                sourceId=source_id, **extra)

categories = []
for gt_class in ['gt500', 'gt300']:
    source_id = 'super-gt-' + gt_class
    url = f'https://supergt.net/teams_and_drivers?gt_class={gt_class}&series=2026'
    doc = document(source_id, url, '2026 series entry; event substitutions are separate')
    entries = []
    for row in doc.xpath('//table[contains(@class,"drivers_teams")]/tr[td]'):
        cells = row.xpath('./td')
        names = [text(n) for n in elements(cells[1], 'driver_icon')]
        machine = elements(cells[2], 'team_machine')[0].xpath('./dd')
        tyre = cells[3].xpath('.//img/@alt')
        entries.append(entry(text(cells[0]), text(machine[0]), text(machine[2]).strip('()'),
                             names, source_id, displayMachine=text(machine[1]),
                             tyreSupplier=tyre[0] if tyre else None))
    if len(entries) < (14 if gt_class == 'gt500' else 25) or any(not e['drivers'] for e in entries):
        raise ValueError('SUPER GT directory changed or is incomplete')
    categories.append(dict(id='super-gt-' + gt_class, label='SUPER GT ' + gt_class.upper(), entries=entries))

url = 'https://kyojocup.jp/profile/'
doc = document('kyojo-directory', url)
links = [(urljoin(url, a.get('href')), text(a)) for a in doc.xpath('//div[contains(@class,"driver_list")]/a')]
if len(links) != 20:
    raise ValueError('Review KYOJO roster count before importing')
with ThreadPoolExecutor(max_workers=4) as pool:
    profiles = list(pool.map(fetch, [link[0] for link in links]))
entries = []
for (url, name), raw in zip(links, profiles):
    doc = html.fromstring(raw)
    fields = {text(dl.xpath('./dt')[0]): text(dl.xpath('./dd')[0])
              for dl in doc.xpath('//dl[dt and dd]')}
    number, machine = fields.get('ゼッケン'), fields.get('マシン名')
    if not number or not machine or 'KC-MG01' not in machine:
        raise ValueError(f'KYOJO profile missing car identity: {url}')
    source_id = 'kyojo-car-' + number
    record(source_id, url, raw, '2026 driver profile')
    entries.append(entry(number, machine.replace('KC-MG01', '').strip(), 'KC-MG01', [name], source_id))
categories.insert(0, dict(id='kyojo', label='KYOJO CUP', entries=entries))

url = 'https://www.indycar.com/Drivers'
doc = document('indycar-directory', url, '2026 driver directory, including Indianapolis-only drivers; not one simultaneous field')
entries = []
for card in doc.xpath(f'//a[{cls("driver-card")}]'):
    name = value(card, 'driver-card-identity-first-name') + ' ' + value(card, 'driver-card-identity-last-name')
    plate = elements(card, 'driver-card-image-endplate')[0].get('alt')
    number = re.fullmatch(r'Endplate for (\d+)', plate)
    if not number:
        raise ValueError(f'INDYCAR number unavailable: {name}')
    logos = elements(card, 'driver-card-logo-item')
    team = logos[0].get('alt').removesuffix(' logo') if logos else None
    engine = logos[1].get('alt').removesuffix(' logo') if len(logos) > 1 else None
    entries.append(entry(number[1], team, None, [name], 'indycar-directory', engine=engine,
                         driverUrl=urljoin(url, card.get('href'))))
if len(entries) != 33:
    raise ValueError('Review INDYCAR roster count before importing')
categories.append(dict(id='indycar', label='NTT INDYCAR SERIES', entries=entries))

wec_url = 'https://www.fiawec.com/umbrella_media/2026-fia-wec-6-hours-of-imola-provisional-entry-list-v1-69d4e4cb3605b287966807.pdf'
raw = fetch(wec_url)
record('wec-imola-v1', wec_url, raw, 'Imola provisional entry list v1, 2026-04-07; event snapshot, not all season or Le Mans')
# PDF layout mode preserves the car/crew columns, including absent third drivers.
pdf_text = '\n'.join(page.extract_text(extraction_mode='layout') for page in PdfReader(io.BytesIO(raw)).pages)
wec_entries = {'hypercar': [], 'lmgt3': []}
category = 'hypercar'
for line in pdf_text.splitlines():
    if 'LMGT3 COMPETITORS' in line:
        category = 'lmgt3'
    columns = re.split(r'\s{2,}', line.strip())
    if not columns or not re.fullmatch(r'\d{1,3}', columns[0]) or len(columns) < 7:
        continue
    # Columns: number, entrant, nation, tyre, car, optional HY, then crew/category pairs.
    number, team, nation, tyre, machine = columns[:5]
    crew = []
    for column in columns[5:]:
        if column in ['HY', '-', 'P', 'G', 'S', 'B']:
            continue
        name = re.sub(r'\s*\([A-Z]{3}\).*$', '', column).strip()
        name = re.sub(r'\s+[PGSB]$', '', name)
        if len(name) > 1:
            crew.append(name)
    if not crew:
        raise ValueError(f'WEC crew parsing failed: {line}')
    wec_entries[category].append(entry(number, team, machine, crew, 'wec-imola-v1',
                                      tyreSupplier={'M': 'Michelin', 'G': 'Goodyear'}.get(tyre)))
for category, entries in wec_entries.items():
    if len(entries) != (17 if category == 'hypercar' else 18):
        raise ValueError(f'WEC layout changed: {category} has {len(entries)} entries')
    categories.append(dict(id='wec-' + category, label='WEC ' + category.upper(), entries=entries))

calendars = {}
url = 'https://supergt.net/calendar'
doc = document('super-gt-calendar', url, '2026 amended calendar; Round 3 relocated to Motegi')
events = []
for row in doc.xpath('//table[contains(@class,"common")]/tr[td]'):
    cells = row.xpath('./td')
    if len(cells) < 4:
        continue
    match = re.search(r'Round(\d+)\s+(\w+)', text(cells[1]))
    if not match:
        continue
    events.append(dict(round=int(match[1]), trackName=text(cells[2]),
                       trackKey=match[2].lower(), dateLabel=text(cells[0]),
                       raceName=text(cells[3]), sourceId='super-gt-calendar'))
if len(events) != 8:
    raise ValueError('SUPER GT calendar incomplete')
calendars['super-gt'] = events

document('kyojo-calendar', 'https://kyojocup.jp/schedule/', '2026 five meetings / ten races, all Fuji')
# Reviewed dates from the official schedule, not inferred from past seasons.
calendars['kyojo'] = [dict(round=index + 1, trackName='Fuji Speedway', trackKey='fuji',
                          dateLabel=dates, sourceId='kyojo-calendar')
                      for index, dates in enumerate(['2026-05-09 / 2026-05-10', '2026-07-18 / 2026-07-19',
                          '2026-09-05 / 2026-09-06', '2026-10-10 / 2026-10-11', '2026-10-31 / 2026-11-01'])]

url = 'https://www.indycar.com/Schedule'
doc = document('indycar-calendar', url, '2026 full schedule; duplicated responsive cards deduplicated by event URL')
events, seen = [], set()
for card in doc.xpath(f'//div[{cls("schedule-list-container")}]//div[{cls("event-card")}]'):
    links = elements(card, 'event-card-link')
    if not links:
        continue
    event_url = urljoin(url, links[0].get('href'))
    if '/Schedule/2026/' not in event_url or event_url in seen:
        continue
    seen.add(event_url)
    events.append(dict(round=len(events) + 1, trackName=value(card, 'event-card-track-name'),
                       trackKey=event_url.rsplit('/', 1)[1].lower(),
                       dateLabel=value(card, 'event-card-header-date'),
                       raceName=value(card, 'event-card-title'), sourceId='indycar-calendar', url=event_url))
if len(events) != 18:
    raise ValueError(f'INDYCAR calendar changed: {len(events)} races')
calendars['indycar'] = events

wec_calendar_url = 'https://press.fiawec.com/assets/fileuploads/69/ba/69baaf5e53d53.pdf'
wec_calendar_raw = fetch(wec_calendar_url)
record('wec-calendar-base', wec_calendar_url, wec_calendar_raw, '2026 spring calendar; final two rounds superseded by July 28 notice')
document('wec-calendar-amendment',
         'https://www.fiawec.com/en/news/fia-wec-and-fia-confirm-venues-for-final-two-rounds-of-2026/13698',
         '2026-07-28 official amendment: Barcelona and Monza replace Qatar and Bahrain; reflected in current navigation')
calendars['wec'] = [dict(round=index + 1, trackName=name, trackKey=key, dateLabel=dates,
                        sourceId='wec-calendar-base' if index < 6 else 'wec-calendar-amendment')
                   for index, (name, key, dates) in enumerate([
                       ('Autodromo Enzo e Dino Ferrari', 'imola', '2026-04-19'),
                       ('Circuit de Spa-Francorchamps', 'spa', '2026-05-09'),
                       ('Circuit de la Sarthe', 'le-mans', '2026-06-13 / 2026-06-14'),
                       ('Autodromo Jose Carlos Pace', 'interlagos', '2026-07-12'),
                       ('Circuit of the Americas', 'cota', '2026-09-06'),
                       ('Fuji Speedway', 'fuji', '2026-09-27'),
                       ('Circuit de Barcelona-Catalunya', 'barcelona', '2026-10-18'),
                       ('Autodromo Nazionale Monza', 'monza', '2026-11-08'),
                   ])]

catalog = dict(schemaVersion=1, season=2026, verifiedOn=args.as_of, sources=sources,
               categories=categories, calendars=calendars)
target = ROOT / 'src/data/expansionCatalog2026.json'
target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({c['id']: len(c['entries']) for c in categories}))
