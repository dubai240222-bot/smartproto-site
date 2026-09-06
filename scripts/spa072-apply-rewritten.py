#!/usr/bin/env python3
"""Apply spa072 rewritten JSON into smartproto.db articles table."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/opt/apps/smartproto/data/smartproto.db")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = json.loads(Path(args.inp).read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise SystemExit("empty input")

    con = sqlite3.connect(args.db)
    updated = 0
    for row in rows:
        slug = row.get("slug")
        title = (row.get("title") or "").strip()
        content = (row.get("content") or "").strip()
        summary = (row.get("summary") or "").strip()
        tags = row.get("tags")
        if isinstance(tags, list):
            tags_s = json.dumps(tags, ensure_ascii=False)
        else:
            tags_s = tags if isinstance(tags, str) else "[]"
        read_time = (row.get("readTime") or "").strip() or None
        if not slug or not title or not content:
            print(f"skip bad row: {slug}")
            continue
        cur = con.execute("SELECT 1 FROM articles WHERE slug=?", (slug,)).fetchone()
        if not cur:
            print(f"missing slug in db: {slug}")
            continue
        updated += 1
        print(f"update {slug} ({len(content.split())} words)")
        if args.dry_run:
            continue
        if read_time:
            con.execute(
                "UPDATE articles SET title=?, summary=?, content=?, tags=?, readTime=? WHERE slug=?",
                (title, summary, content, tags_s, read_time, slug),
            )
        else:
            con.execute(
                "UPDATE articles SET title=?, summary=?, content=?, tags=? WHERE slug=?",
                (title, summary, content, tags_s, slug),
            )
    if not args.dry_run:
        con.commit()
    con.close()
    print(f"{'Would update' if args.dry_run else 'Updated'}: {updated}")


if __name__ == "__main__":
    main()
