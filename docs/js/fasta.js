/* FASTA parsing and filtering — runs entirely in the browser.
 *
 * The user's proteome FASTA (`*.a.faa`, predicted proteins from Prodigal) is
 * read locally and never uploaded anywhere. Headers look like:
 *   >Ga0591005_0000001_64_2802 # Prodigal v2.6.3 # 64 # 2802 # + # tt=11
 * The gene id is the first whitespace-delimited token and matches column 0 of
 * the KO annotation table exactly.
 */

/* Extract the gene id from a FASTA header line (without the leading '>').
 *   Ga0591005_0000001_64_2802 # Prodigal ...  -> Ga0591005_0000001_64_2802
 * The id is taken verbatim (no isoform/suffix stripping): metaproteomics gene
 * ids are positional and must match the KO table byte-for-byte. */
export function headerGeneId(header) {
  return header.split(/\s+/)[0];
}

/* Parse a full FASTA text into a Map: geneId -> full record string
 * (header line + sequence lines, including the leading '>'). Later records
 * with a duplicate key overwrite earlier ones. */
export function indexFasta(text) {
  const records = new Map();
  const chunks = text.split('\n>');
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (i === 0) {
      const gt = chunk.indexOf('>');
      if (gt < 0) continue;
      chunk = chunk.slice(gt + 1);
    }
    chunk = chunk.replace(/\s+$/, '');
    if (!chunk) continue;
    const nl = chunk.indexOf('\n');
    const header = nl < 0 ? chunk : chunk.slice(0, nl);
    const id = headerGeneId(header);
    records.set(id, '>' + chunk + '\n');
  }
  return records;
}

/* Build a tailored FASTA string from a set of gene ids.
 * Returns { text, matched:Set, missing:Set } — matched are gene ids found in
 * the proteome, missing are selected gene ids absent from it. */
export function emitFasta(geneIdSet, records) {
  const out = [];
  const matched = new Set();
  const missing = new Set();
  for (const id of geneIdSet) {
    const rec = records.get(id);
    if (rec) {
      out.push(rec);
      matched.add(id);
    } else {
      missing.add(id);
    }
  }
  return { text: out.join(''), matched, missing };
}
