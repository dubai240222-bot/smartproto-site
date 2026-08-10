#!/usr/bin/env python3
"""Apply SP-A-071 rewritten articles into Hetzner smartproto.db."""
import json
import re
import sqlite3
import sys

CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]")

def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/spa071-rewritten.json"
    db_path = sys.argv[2] if len(sys.argv) > 2 else "/opt/apps/smartproto/data/smartproto.db"
    arts = json.load(open(path, encoding="utf-8"))
    db = sqlite3.connect(db_path)
    cur = db.cursor()
    updated = 0
    for a in arts:
        tags = a["tags"] if isinstance(a["tags"], str) else json.dumps(a["tags"], ensure_ascii=False)
        blob = f'{a["title"]}\n{a["summary"]}\n{a["content"]}\n{tags}'
        if CJK.search(blob):
            raise SystemExit(f'CJK remains in {a["slug"]}')
        cur.execute(
            """
            UPDATE articles
            SET title=?, summary=?, content=?, tags=?, readTime=?,
                updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE slug=?
            """,
            (a["title"], a["summary"], a["content"], tags, a["readTime"], a["slug"]),
        )
        if cur.rowcount != 1:
            raise SystemExit(f'slug not updated: {a["slug"]} rowcount={cur.rowcount}')
        updated += 1
        print("OK", a["slug"], "->", a["title"][:80])
    db.commit()
    print("updated", updated)
    slugs = [a["slug"] for a in arts]
    q = f"SELECT slug, title, length(content) FROM articles WHERE slug IN ({','.join('?'*len(slugs))}) ORDER BY publishedAt DESC"
    for row in cur.execute(q, slugs):
        print("LIVE:", row[0], "|", row[1], "| chars=", row[2])
    db.close()

if __name__ == "__main__":
    main()
