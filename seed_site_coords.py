"""
One-time seed script: updates all existing Ikan FM sites with GPS coordinates.
Run from the backend directory:
  cd backend && python3 ../seed_site_coords.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/backend')

from database import SessionLocal
import models

SITE_COORDS = {
    'sc-avonmeads':   (51.4516, -2.5691),
    'sc-bluewater':   (51.4429, 0.2731),
    'sc-cardiff':     (51.5461, -3.2153),
    'sc-reading':     (51.4305, -0.9438),
    'sc-teeside':     (54.5705, -1.2174),
    'sc-southampton': (50.9049, -1.4043),
    'vc-dagenham':    (51.5396, 0.1278),
    'vc-purley':      (51.3741, -0.0851),
    'vc-finchley':    (51.6120, -0.1756),
    'vc-woodgreen':   (51.5976, -0.1094),
    'vc-starcity':    (52.4934, -1.8626),
    'vc-harrow':      (51.5796, -0.3364),
    'vc-leeds':       (53.8084, -1.5931),
    'vc-islington':   (51.5342, -0.1028),
    'vc-thurrock':    (51.4923, 0.3103),
    'vc-cribbs':      (51.5228, -2.5945),
    'vc-doncaster':   (53.5228, -1.1286),
    'vc-whitecity':   (51.5074, -0.2228),
    'vc-shepherds':   (51.5041, -0.2184),
    'vc-stratford':   (51.5432, -0.0042),
    'vc-nottingham':  (52.9548, -1.1465),
    'other':          (None, None),
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
