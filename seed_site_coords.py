"""
One-time seed script: updates all existing Ikan FM sites with GPS coordinates.
Run from the backend directory:
  cd backend && python3 ../seed_site_coords.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/backend')
# Use Railway public URL when running locally
if not os.getenv('DATABASE_URL'):
    os.environ['DATABASE_URL'] = 'postgresql://postgres:bXbYQFKHYGXciCdWNdFVlCRiqdJaJInd@metro.proxy.rlwy.net:21553/railway'

from database import SessionLocal
import models

SITE_COORDS = {
    'sc-avonmeads':   (51.4537, -2.5648),   # Showcase Avonmeads, Bristol
    'sc-bluewater':   (51.4380,  0.2720),   # Showcase Bluewater, Greenhithe
    'sc-cardiff':     (51.5093, -3.2137),   # Showcase Cardiff, Nantgarw
    'sc-reading':     (51.4309, -0.9734),   # Showcase Reading, Loddon Bridge
    'sc-teeside':     (54.5418, -1.1760),   # Showcase Teeside, Xscape Middlesbrough
    'sc-southampton': (50.9074, -1.4047),   # Showcase Southampton, West Quay
    'vc-dagenham':    (51.5387,  0.1149),   # Vue Dagenham Leisure Park
    'vc-purley':      (51.3739, -0.0903),   # Vue Purley Way, Croydon
    'vc-finchley':    (51.6057, -0.1727),   # Vue Finchley, Great North Leisure Park
    'vc-woodgreen':   (51.5971, -0.1099),   # Vue Wood Green, The Mall
    'vc-starcity':    (52.4934, -1.8626),   # Vue Star City Birmingham
    'vc-harrow':      (51.5796, -0.3364),   # Vue Harrow, St Georges
    'vc-leeds':       (53.8173, -1.5756),   # Vue Leeds Kirkstall Bridge
    'vc-islington':   (51.5342, -0.1028),   # Vue Islington Square
    'vc-thurrock':    (51.4923,  0.3103),   # Vue Thurrock, Lakeside
    'vc-cribbs':      (51.5228, -2.5945),   # Vue Cribbs Causeway Bristol
    'vc-doncaster':   (53.5228, -1.1286),   # Vue Doncaster, Frenchgate
    'vc-whitecity':   (51.5074, -0.2228),   # Vue Westfield White City
    'vc-shepherds':   (51.5074, -0.2228),   # Vue Shepherds Bush, Westfield
    'vc-stratford':   (51.5432, -0.0042),   # Vue Westfield Stratford
    'vc-nottingham':  (52.9534, -1.1496),   # Vue Nottingham, Corner House
    'sc-leicester':   (52.6366, -1.1387),   # Showcase Leicester (unchanged — not in update list)
    'other':          (None,     None),     # Generic site — no GPS check
}


def seed():
    db = SessionLocal()
    try:
        updated = 0
        skipped = 0
        for site in db.query(models.Site).all():
            if site.code in SITE_COORDS:
                lat, lng = SITE_COORDS[site.code]
                site.site_lat = lat
                site.site_lng = lng
                updated += 1
                print(f"  ✓ {site.code:24s} → ({lat}, {lng})")
            else:
                skipped += 1
                print(f"  — {site.code:24s} (no coords in map)")
        db.commit()
        print(f"\nDone: {updated} updated, {skipped} skipped")
    finally:
        db.close()


if __name__ == '__main__':
    print("Seeding site GPS coordinates…\n")
    seed()
