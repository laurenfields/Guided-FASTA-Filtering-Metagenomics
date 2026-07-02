/* DIA-NN spectral library (.tsv) filtering — streamed in the browser.
 *
 * DIA-NN libraries can be multi-GB. The file is read as a stream and filtered
 * line by line, so the full input is never held in memory; only the (small)
 * tailored output accumulates. The user's library never leaves their machine.
 *
 * A row is kept if any id in its protein column is in the selection set (the
 * KO-selected gene set). The protein column is `Protein.Ids` for DIA-NN .tsv
 * libraries, with several fallbacks. Group strings are semicolon-delimited.
 *
 * Metaproteomics note: gene ids (e.g. Ga0591005_0000001_64_2802) are matched
 * verbatim — no UniProt-style isoform/suffix stripping — so they line up with
 * the FASTA header ids exactly.
 */

const PROTEIN_COLS = ['Protein.Ids', 'Protein.Group', 'ProteinGroup', 'Protein.Names', 'ProteinID'];

/* Filter a DIA-NN library .tsv File against a gene-id Set.
 * onProgress(bytesRead, bytesTotal) is called periodically if supplied.
 * Returns { tsv, keptRows, totalRows, proteinColumn, proteinGroups }.
 *
 * `proteinGroups` is the count of distinct protein-column strings among kept
 * rows — typically larger than the selected gene count because DIA-NN
 * co-groups peptide-sharing sequences into one Protein.Ids string. */
export async function filterLibraryTsv(file, geneIdSet, onProgress) {
  const stream = file.stream().pipeThrough(new TextDecoderStream());
  const reader = stream.getReader();

  let buffer = '';
  let headerLine = null;
  let protCol = -1;
  let protColName = null;
  const outLines = [];
  const keptGroups = new Set();
  let keptRows = 0;
  let totalRows = 0;
  let bytesRead = 0;
  const bytesTotal = file.size;

  const handleLine = (line) => {
    if (headerLine === null) {
      headerLine = line;
      const cols = line.split('\t');
      for (const name of PROTEIN_COLS) {
        const idx = cols.indexOf(name);
        if (idx >= 0) { protCol = idx; protColName = name; break; }
      }
      if (protCol < 0) {
        throw new Error(
          'No protein column found in library header. Expected one of: '
          + PROTEIN_COLS.join(', ') + '.'
        );
      }
      outLines.push(line);
      return;
    }
    if (!line) return;
    totalRows += 1;
    const fields = line.split('\t');
    const protCell = fields[protCol] || '';
    const ids = protCell.split(';');
    for (const id of ids) {
      if (geneIdSet.has(id.trim())) {
        outLines.push(line);
        keptRows += 1;
        keptGroups.add(protCell);
        break;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.length;
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, nl);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
    }
    if (onProgress) onProgress(bytesRead, bytesTotal);
  }
  // trailing line with no final newline
  let tail = buffer;
  if (tail.endsWith('\r')) tail = tail.slice(0, -1);
  if (tail) handleLine(tail);

  return {
    tsv: outLines.join('\n') + '\n',
    keptRows,
    totalRows,
    proteinColumn: protColName,
    proteinGroups: keptGroups.size,
  };
}
