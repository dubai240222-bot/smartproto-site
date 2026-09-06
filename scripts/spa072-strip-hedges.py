#!/usr/bin/env python3
"""SP-A-072: strip hedge/disclaimer paragraphs from published articles (SQLite)."""

from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path

HEDGE_RE = re.compile(
    r"независим(?:ые|ых|ое)\s+(?:испытан|тест|обзор)"
    r"|испытан\w*\s+пока\s+не\s+проводил"
    r"|тесты?\s+пока\s+не\s+проводил"
    r"|пока\s+не\s+проводились"
    r"|независимых\s+испытаний\s+пока\s+нет"
    r"|не\s+уточня(?:ют(?:ся)?|ется|ены|ен|ет)"
    r"|не\s+раскрыв(?:ается|аются|ается|ты|т)"
    r"|не\s+сообща(?:ется|ются|ет)"
    r"|информаци\w+\s+отсутств"
    r"|оста(?:ютс)?я\s+неизвестн"
    r"|затрудняет\s+оценк"
    r"|не\s+позволяет\s+судить"
    r"|производитель\s+не\s+уточн"
    r"|детальные\s+технические\s+характеристики"
    r"|данные\s+об\s+автономности"
    r"|полные\s+технические\s+характеристики"
    r"|на\s+момент\s+публикации\s+не\s+(?:были\s+)?(?:обнародован|известн)"
    r"|обзоров?\s+(?:устройства\s+)?пока\s+нет",
    re.I,
)

SHORT_HEDGE_HINT = re.compile(
    r"(?:не|нет)\s+(?:уточн|раскрыт|сообщ|известн|объявлен|проведен)",
    re.I,
)
SHORT_TOPIC = re.compile(
    r"(?:характеристик|автономност|испытан|тест|обзор|дата|продаж|цен)",
    re.I,
)


def paragraph_is_hedge(p: str) -> bool:
    t = p.strip()
    if not t:
        return False
    if HEDGE_RE.search(t):
        return True
    if len(t) < 280 and SHORT_HEDGE_HINT.search(t) and SHORT_TOPIC.search(t):
        return True
    return False


def strip_hedges(text: str) -> str:
    parts = [p.strip() for p in re.split(r"\n{2,}", text or "") if p.strip()]
    kept: list[str] = []
    for p in parts:
        if paragraph_is_hedge(p):
            continue
        sentences = re.split(r"(?<=[.!?…])\s+", p)
        if len(sentences) > 1:
            sentences = [s for s in sentences if not paragraph_is_hedge(s)]
            p = " ".join(sentences).strip()
        if p and not paragraph_is_hedge(p):
            kept.append(p)
    return "\n\n".join(kept).strip()


def first_sentence(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    m = re.split(r"(?<=[.!?…])\s+", t, maxsplit=1)
    return m[0].strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--db",
        default="/opt/apps/smartproto/data/smartproto.db",
        help="Path to SQLite DB",
    )
    ap.add_argument("--limit", type=int, default=0, help="Only N newest (0=all)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    db = Path(args.db)
    if not db.exists():
        raise SystemExit(f"DB not found: {db}")

    con = sqlite3.connect(str(db))
    con.row_factory = sqlite3.Row
    q = "SELECT slug, title, summary, content FROM articles ORDER BY publishedAt DESC"
    if args.limit > 0:
        q += f" LIMIT {int(args.limit)}"
    rows = con.execute(q).fetchall()

    changed = 0
    for row in rows:
        content = row["content"] or ""
        summary = row["summary"] or ""
        new_content = strip_hedges(content)
        new_summary = strip_hedges(summary)
        if not new_content and content:
            # Never empty the article — keep original if strip wiped everything
            new_content = content
        if new_summary != summary and (not new_summary or paragraph_is_hedge(new_summary)):
            new_summary = first_sentence(new_content) or summary
        if new_content == content and new_summary == summary:
            continue
        changed += 1
        print(f"— {row['slug']}")
        if args.dry_run:
            continue
        con.execute(
            "UPDATE articles SET content=?, summary=? WHERE slug=?",
            (new_content, new_summary, row["slug"]),
        )

    if not args.dry_run:
        con.commit()
    con.close()
    print(f"{'Would update' if args.dry_run else 'Updated'}: {changed} / {len(rows)}")


if __name__ == "__main__":
    main()
