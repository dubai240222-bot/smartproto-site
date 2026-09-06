#!/usr/bin/env python3
"""SP-A-073: remove gray commodity cards from public SQLite feed."""

from __future__ import annotations

import argparse
import sqlite3

# Explicit dull recent cards + pattern-assisted cleanup.
GRAY_SLUGS = [
    "china-jbl-pulse-6",
    "china-lava-smart-4",
    "china-sc880",
    "china-xboom-blast",
    "altar-ii-mechanical-keyboard",
    "china-iqoo-t",
    "china-iqoo-z11s",
    "china-openfit-2-ai",
    "china-nvme",
    "china-mini",
    "china-v6",
    "rainpoint-s-connected-watering-system-puts-a-gateway-two-zones-and-a-soil-sensor",
    "delta-children-aero-smart-auto-glide-bassinet",
    "diy-writing-devices-get-expensive-fast-so-this-one-costs-almost-nothing",
    "china-ms-03",
    # battery/spec phone card — low shareability vs robotics/AI
    "china-redmi-17-5g",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/opt/apps/smartproto/data/smartproto.db")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    existing = {
        r[0]
        for r in con.execute(
            f"SELECT slug FROM articles WHERE slug IN ({','.join('?' * len(GRAY_SLUGS))})",
            GRAY_SLUGS,
        )
    }
    print("found", sorted(existing))
    if args.dry_run:
        print("dry-run: would delete", len(existing))
        return
    con.execute(
        f"DELETE FROM articles WHERE slug IN ({','.join('?' * len(GRAY_SLUGS))})",
        GRAY_SLUGS,
    )
    con.commit()
    left = con.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    print(f"deleted {len(existing)}; articles left={left}")
    con.close()


if __name__ == "__main__":
    main()
