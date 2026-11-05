"""
Villages for Yavaya's place table, from GeoNames (https://www.geonames.org, CC BY 4.0).

    python3 tools/places/villages.py <dir with BZ.txt GT.txt SV.txt HN.txt NI.txt CR.txt PA.txt>

Writes platform/src/server/db/seed/villages-data.ts. The cities and towns
(platform/src/server/db/seed/places-data.ts) stay as they are; this adds, in
the seven Central American countries, every other populated place GeoNames
lists — whatever its population, recorded or not — so a member in a small
village finds it by name. Mexico is not included: it alone has several times
more small localities than the rest together (see CONFIGURATION.md, "Places").

Each village is filed under the department of the existing places it sits
among: GeoNames' first-level code is matched to Yavaya's department codes by
the cities and towns both lists share. A village whose name and position
already belong to a city or town is not added twice.

Codes are stable for the same data: the department code and the name's slug,
with the GeoNames id appended only where two places would share a code.
"""
import json, math, re, sys, unicodedata, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLACES = ROOT / 'platform/src/server/db/seed/places-data.ts'
OUT = ROOT / 'platform/src/server/db/seed/villages-data.ts'
COUNTRIES = {'BZ': 'bz', 'GT': 'gt', 'SV': 'sv', 'HN': 'hn', 'NI': 'ni', 'CR': 'cr', 'PA': 'pa'}
# Populated places that are places people live in today: not historical, abandoned, destroyed, or parts of a city.
KINDS = {'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLL', 'PPLS', 'PPLF', 'PPLR'}


def fold(text):
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()


def slug(text):
    return fold(text).replace(' ', '-')


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main(source):
    rows = re.findall(r'\["([^"]+)", "([^"]+)", "((?:[^"\\]|\\.)*)", "(city|town)", (null|\d+), (-?[\d.]+), (-?[\d.]+)\]', PLACES.read_text())
    existing = [dict(code=c, state=s, name=json.loads(f'"{n}"'), lat=float(la), lon=float(lo)) for c, s, n, _, _, la, lo in rows]
    codes = {p['code'] for p in existing}
    by_country = collections.defaultdict(list)
    for p in existing:
        by_country[p['state'].split('.')[1]].append(p)

    villages = []
    for iso, cc in COUNTRIES.items():
        geo = []
        for line in (pathlib.Path(source) / f'{iso}.txt').read_text(encoding='utf-8').splitlines():
            f = line.split('\t')
            if f[6] != 'P' or f[7] not in KINDS:
                continue
            geo.append(dict(id=f[0], name=f[1], lat=float(f[4]), lon=float(f[5]), admin1=f[10], population=int(f[14] or 0)))
        known = by_country[cc]
        # GeoNames first-level code -> Yavaya department, by the places both lists share.
        names = collections.defaultdict(list)
        for g in geo:
            names[fold(g['name'])].append(g)
        votes = collections.defaultdict(collections.Counter)
        for p in known:
            for g in names.get(fold(p['name']), []):
                if km((p['lat'], p['lon']), (g['lat'], g['lon'])) < 8:
                    votes[g['admin1']][p['state']] += 1
        state_of = {a: c.most_common(1)[0][0] for a, c in votes.items()}
        # A place already in the table (same name, within 5 km) is not a new village.
        near_known = collections.defaultdict(list)
        for p in known:
            near_known[fold(p['name'])].append(p)
        for g in geo:
            state = state_of.get(g['admin1'])
            if not state:
                continue
            if any(km((p['lat'], p['lon']), (g['lat'], g['lon'])) < 5 for p in near_known.get(fold(g['name']), [])):
                continue
            villages.append(dict(g, state=state))

    # Same name in the same department twice (two villages, or one listed twice nearby): keep one per 2 km.
    villages.sort(key=lambda v: (v['state'], fold(v['name']), -v['population'], int(v['id'])))
    kept = []
    for v in villages:
        if kept and kept[-1]['state'] == v['state'] and fold(kept[-1]['name']) == fold(v['name']) and km((kept[-1]['lat'], kept[-1]['lon']), (v['lat'], v['lon'])) < 2:
            continue
        kept.append(v)
    seen = collections.Counter(f"{v['state']}.{slug(v['name'])}" for v in kept)
    out = []
    for v in kept:
        base = f"{v['state']}.{slug(v['name'])}"
        code = base if seen[base] == 1 and base not in codes else f"{base}-{v['id']}"
        codes.add(code)
        out.append([code, v['state'], v['name'], 'village', v['population'] or None, round(v['lat'], 5), round(v['lon'], 5)])
    out.sort(key=lambda r: (r[1], -(r[4] or 0), r[2]))

    lines = [
        '/**',
        ' * Villages of the seven Central American launch countries: every populated',
        ' * place GeoNames lists that is not already a city or town in places-data.ts,',
        ' * whatever its population. Generated by tools/places/villages.py from',
        ' * GeoNames (https://www.geonames.org, CC BY 4.0); do not edit by hand.',
        ' * Each row is [code, state code, name, level, population, latitude, longitude].',
        ' * Codes are stable public identifiers and are never renamed.',
        ' */',
        "import type { SeedPlace } from './places-data';",
        '',
        f'// {len(out)} villages.',
        'export const VILLAGES: SeedPlace[] = [',
    ]
    lines += ['  ' + json.dumps(r, ensure_ascii=False) + ',' for r in out]
    lines += ['];', '']
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(len(out), 'villages;', collections.Counter(r[1].split('.')[1] for r in out))


if __name__ == '__main__':
    main(sys.argv[1])
