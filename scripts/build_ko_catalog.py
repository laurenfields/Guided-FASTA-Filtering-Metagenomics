#!/usr/bin/env python3
"""Build the bundled KO catalog shipped with the web app.

Fetches the full KEGG Orthology list (KO id -> function name) from the public
KEGG REST API and writes a compact JSON the browser app loads to search KO
terms by name and show what each Kxxxxx is.

    python scripts/build_ko_catalog.py

Output: docs/data/ko_catalog.json
    {
      "release": "2026-06-26",          # date fetched (KEGG KO has no versioned release id)
      "count": 26000,
      "terms": { "K00001": "ADH; alcohol dehydrogenase [EC:1.1.1.1]", ... }
    }

KEGG REST is free for academic use. The KO list is ~1.6 MB and changes slowly,
so re-run this only when you want to refresh the catalog.
"""
from __future__ import annotations

import datetime as _dt
import json
import sys
import urllib.request
from pathlib import Path

KEGG_LIST_KO = "https://rest.kegg.jp/list/ko"
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "ko_catalog.json"


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=120) as resp:
        if resp.status != 200:
            raise SystemExit(f"KEGG returned HTTP {resp.status} for {url}")
        return resp.read().decode("utf-8")


def main() -> int:
    print(f"Fetching {KEGG_LIST_KO} ...", file=sys.stderr)
    text = fetch(KEGG_LIST_KO)

    terms: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        ko, name = parts
        ko = ko.removeprefix("ko:").strip()   # list endpoint emits bare "K00001"; be defensive
        if not ko.startswith("K"):
            continue
        terms[ko] = name.strip()

    if len(terms) < 1000:
        raise SystemExit(f"Only parsed {len(terms)} KO terms — refusing to write a truncated catalog.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "release": _dt.date.today().isoformat(),
        "count": len(terms),
        "terms": terms,
    }
    with OUT.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    size_mb = OUT.stat().st_size / 1e6
    print(f"Wrote {len(terms):,} KO terms -> {OUT} ({size_mb:.2f} MB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
