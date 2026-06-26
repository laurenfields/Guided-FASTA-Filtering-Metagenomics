# Guided FASTA Filtering — Metaproteomics (KO)

A static, client-side web app that builds a **tailored protein FASTA for a
metagenome sample** from KEGG Orthology (KO) terms. It runs entirely in the
browser — no server, no Python, nothing to install — and the sample's files
are filtered locally and never uploaded.

It is a metaproteomics adaptation of
[Guided-FASTA-Filtering](https://github.com/laurenfields/Guided-FASTA-Filtering):
the original resolves a disease/GO term to human UniProt accessions via live
APIs, then subsets a reference proteome. Here the term is a **KO**, and the
KO → gene mapping is read directly from the sample's own annotation table —
so the whole pipeline is a local join with no API required.

> **Live site:** `https://<your-account>.github.io/<repo-name>/`
> (after you push to GitHub and enable Pages — see below).

## What it does

```
KO term(s)  →  gene ids carrying them (from this sample's .ko.txt)
            →  subset this sample's predicted-protein .faa
            →  download: tailored FASTA + gene→KO map + reproducibility manifest
```

1. **Load the sample's KO annotation** — the IMG/JGI `*.a.ko.txt` table
   (tab-separated: `gene_id  flag  KO:Kxxxxx  …`).
2. **Find and pick KO terms** — type a K-number (`K02588`) or a function name
   (`nitrogenase`); the picker searches the KO terms *present in your sample*,
   named from a bundled KEGG catalog, and shows how many genes each covers.
3. **Set parameters** — optional min/max gene count and seeded random padding
   (draws extra genes from the FASTA to reach a minimum — useful as a null /
   decoy background).
4. **Load the sample's proteome FASTA** — the matching `*.a.faa`
   (Prodigal-predicted proteins). The app warns if its gene-id prefix doesn't
   match the KO file, i.e. they're from different assemblies.
5. **Generate** — download the tailored `.faa`, a `gene→KO` `.tsv`, and a
   `manifest.json` recording every choice.

The KO annotation table and the FASTA **must come from the same sample/assembly**
(same `Ga…` gene-id prefix), because filtering is an exact gene-id join.

## Inputs (example data)

| File | Example | Notes |
|---|---|---|
| KO annotation | `3300060604.a.ko.txt` | gene id in col 0, `KO:Kxxxxx` in col 2 |
| Proteome FASTA | `faa_3300060604.a.faa` | header `>Ga0591005_… # Prodigal …` |

Both share the `Ga0591005` prefix → they join. (The `3300060428` KO file uses
`Ga0591030` and would *not* join with this FASTA — the app flags exactly that.)

## Enabling GitHub Pages

This repo has no remote yet. To publish:

```bash
# create the GitHub repo (e.g. with the gh CLI, or via github.com), then:
git remote add origin https://github.com/<account>/<repo-name>.git
git push -u origin main
```

On GitHub: **Settings → Pages → Build and deployment** → Source: *Deploy from a
branch* → Branch: `main`, folder: `/docs` → Save. The site goes live in a minute
or two. (The `docs/.nojekyll` file is already present so the JS modules serve
correctly.)

## Local testing

ES modules won't load over `file://`. Serve the `docs/` folder over HTTP:

```bash
cd docs
python -m http.server 8000
# open http://localhost:8000/
```

## KO catalog

KO term *names* come from `docs/data/ko_catalog.json` (~28k terms, KO id →
function name), bundled so search-by-name works fully offline. To refresh it
from KEGG:

```bash
python scripts/build_ko_catalog.py    # rewrites docs/data/ko_catalog.json
```

The app still works without the catalog (search by K-number only).

## Layout

```
docs/                          # the deployable static site (GitHub Pages root)
  index.html                   # single-page UI
  css/style.css
  data/ko_catalog.json         # bundled KEGG KO id → name catalog
  js/
    app.js                     # UI orchestration
    ko.js                      # parse .ko.txt → gene<->KO maps + sample prefix
    kocatalog.js               # load the bundled KO catalog
    fasta.js                   # FASTA parsing + filtering (in-browser)
    padding.js                 # seeded random padding
    manifest.js                # reproducibility manifest
scripts/
  build_ko_catalog.py          # regenerate the bundled KO catalog from KEGG
```

## Privacy

Everything runs in your browser. The KO table and FASTA are read with the
local File API and **never uploaded**. The only network request is the
one-time fetch of the bundled KO catalog that ships with the site.

## Data sources

- **KEGG Orthology** — KO id → function names, via the public KEGG REST API
  (`rest.kegg.jp/list/ko`). Free for academic use.
- **Sample annotations** — IMG/JGI `*.a.ko.txt` KO tables and Prodigal
  `*.a.faa` proteomes, supplied by the user per sample.

---

Adapted for metaproteomics from the MacCoss Lab Guided-FASTA-Filtering tool,
University of Washington.
