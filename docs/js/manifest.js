/* Reproducibility manifest — records every choice that produced a tailored
 * FASTA, so a run can be understood and repeated later.
 */

export const TOOL_VERSION = 'guided-fasta-filtering-metaproteomics/1.0';

/* Build the manifest object.
 * args:
 *   terms         - [{id, name, genes}] selected KO terms
 *   params        - {present_in_sample_only, catalog_release, ...}
 *   sizeInputs    - {minProteins, maxProteins, paddingStrategy, paddingSeed}
 *   counts        - {seed, padded, final, matchedInFasta, missingFromFasta}
 *   koFileName    - name of the uploaded KO annotation file
 *   koSummary     - {geneCount, koCount, rowCount, prefix} of that file
 *   fastaFileName - name of the proteome FASTA the user supplied
 *   fastaPrefix   - dominant gene-id prefix of that FASTA
 *   library       - null or {fileName, proteinColumn, keptRows, totalRows, proteinGroups}
 */
export function buildManifest({
  terms, params, sizeInputs, counts,
  koFileName, koSummary, fastaFileName, fastaPrefix, library,
}) {
  return {
    tool: TOOL_VERSION,
    generated_utc: new Date().toISOString(),
    source: 'kegg_ko',
    ko_annotation_file: koFileName,
    ko_annotation_summary: koSummary
      ? {
          genes_annotated: koSummary.geneCount,
          ko_terms_present: koSummary.koCount,
          rows: koSummary.rowCount,
          sample_prefix: koSummary.prefix,
        }
      : null,
    selected_terms: terms.map((t) => ({ id: t.id, name: t.name || null, genes_in_sample: t.genes })),
    parameters: params,
    size_enforcement: {
      min_proteins: sizeInputs.minProteins,
      max_proteins: sizeInputs.maxProteins,
      padding_strategy: sizeInputs.paddingStrategy,
      padding_seed: sizeInputs.paddingSeed,
    },
    gene_counts: {
      from_ko_terms: counts.seed,
      padded: counts.padded,
      final: counts.final,
      matched_in_fasta: counts.matchedInFasta,
      missing_from_fasta: counts.missingFromFasta,
    },
    proteome_fasta: fastaFileName,
    proteome_fasta_prefix: fastaPrefix || null,
    library: library
      ? {
          file_name: library.fileName,
          protein_column: library.proteinColumn,
          rows_kept: library.keptRows,
          rows_total: library.totalRows,
          protein_groups: library.proteinGroups,
          cogrouping_vs_genes: library.proteinGroups - counts.final,
        }
      : null,
    notes: [
      'KO term -> gene resolution is a local join against the uploaded KO annotation table.',
      'KO term names come from a bundled KEGG Orthology catalog.',
      'FASTA and library filtering ran entirely in the browser; input files were not uploaded.',
    ],
  };
}
