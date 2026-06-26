/* KEGG Orthology (KO) annotation parsing — runs entirely in the browser.
 *
 * Input is an IMG/JGI-style per-sample KO annotation table (`*.a.ko.txt`),
 * tab-separated, one gene-call per row:
 *
 *   Ga0591005_0000001_5492_6121<TAB>Yes<TAB>KO:K19664<TAB>100.00<TAB>...
 *   |__ gene id (matches the FASTA header) __|     |__ KO term __|
 *
 * Column 0 is the predicted-gene id (identical to the first token of the
 * matching `.faa` header). Column 2 is `KO:Kxxxxx`. Remaining columns are
 * alignment statistics we don't need. A gene may appear on several rows if it
 * is annotated to more than one KO.
 *
 * This replaces the original tool's live GO/disease API calls: in
 * metaproteomics the term -> gene mapping lives in this uploaded file.
 */

/* The sample/assembly prefix of a gene id, e.g.
 *   Ga0591005_0000001_5492_6121 -> "Ga0591005"
 * Used only to warn when the KO file and FASTA come from different samples. */
export function genePrefix(geneId) {
  const us = geneId.indexOf('_');
  return us > 0 ? geneId.slice(0, us) : geneId;
}

/* Parse the KO annotation text. Returns:
 *   {
 *     koToGenes: Map<ko, Set<geneId>>,   // term -> the genes carrying it
 *     geneToKos: Map<geneId, string[]>,  // gene -> its KO terms (order kept, deduped)
 *     koList:    [{id, genes}],          // KO terms present, sorted by id
 *     geneCount, koCount, rowCount,
 *     prefix,                            // dominant sample/assembly prefix
 *   }
 *
 * Rows without a `KO:Kxxxxx` field are skipped (e.g. unannotated calls).
 */
export function parseKoAnnotation(text) {
  const koToGenes = new Map();
  const geneToKos = new Map();
  const prefixCounts = new Map();
  let rowCount = 0;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const gene = cols[0];
    const koField = cols[2];
    if (!gene || !koField || koField.indexOf('K') < 0) continue;
    const ko = koField.replace(/^KO:/i, '').trim();
    if (!/^K\d{5}$/.test(ko)) continue;

    rowCount += 1;

    let genes = koToGenes.get(ko);
    if (!genes) { genes = new Set(); koToGenes.set(ko, genes); }
    genes.add(gene);

    let kos = geneToKos.get(gene);
    if (!kos) {
      kos = [ko];
      geneToKos.set(gene, kos);
      const p = genePrefix(gene);
      prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
    } else if (!kos.includes(ko)) {
      kos.push(ko);
    }
  }

  const koList = [...koToGenes.entries()]
    .map(([id, genes]) => ({ id, genes: genes.size }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let prefix = '';
  let best = -1;
  for (const [p, n] of prefixCounts) {
    if (n > best) { best = n; prefix = p; }
  }

  return {
    koToGenes,
    geneToKos,
    koList,
    geneCount: geneToKos.size,
    koCount: koToGenes.size,
    rowCount,
    prefix,
  };
}

/* Union of gene ids carrying any of the selected KO terms. */
export function genesForKos(koIds, koToGenes) {
  const union = new Set();
  for (const ko of koIds) {
    const genes = koToGenes.get(ko);
    if (genes) for (const g of genes) union.add(g);
  }
  return union;
}
