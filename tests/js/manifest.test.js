/* Unit tests for docs/js/manifest.js — reproducibility manifest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, TOOL_VERSION } from '../../docs/js/manifest.js';

function sample() {
  return buildManifest({
    terms: [
      { id: 'K01945', name: 'purD; phosphoribosylamine---glycine ligase', genes: 2 },
      { id: 'K19664', name: 'carS', genes: 1 },
    ],
    params: { present_in_sample_only: true, catalog_release: '2026-06-26' },
    sizeInputs: { minProteins: 0, maxProteins: 0, paddingStrategy: 'none', paddingSeed: 42 },
    counts: { seed: 3, padded: 0, final: 3, matchedInFasta: 3, missingFromFasta: 0 },
    koFileName: '3300060604.a.ko.txt',
    koSummary: { geneCount: 291600, koCount: 5561, rowCount: 291600, prefix: 'Ga0591005' },
    fastaFileName: 'faa_3300060604.a.faa',
    fastaPrefix: 'Ga0591005',
  });
}

test('manifest carries the KO source tag and tool version', () => {
  const m = sample();
  assert.equal(m.source, 'kegg_ko');
  assert.equal(m.tool, TOOL_VERSION);
  assert.match(m.generated_utc, /^\d{4}-\d\d-\d\dT/);
});

test('selected_terms map id/name/genes_in_sample', () => {
  const m = sample();
  assert.deepEqual(m.selected_terms[0],
    { id: 'K01945', name: 'purD; phosphoribosylamine---glycine ligase', genes_in_sample: 2 });
});

test('gene_counts reflect the supplied counts', () => {
  const m = sample();
  assert.deepEqual(m.gene_counts, {
    from_ko_terms: 3, padded: 0, final: 3, matched_in_fasta: 3, missing_from_fasta: 0,
  });
});

test('KO annotation summary and FASTA provenance are recorded', () => {
  const m = sample();
  assert.equal(m.ko_annotation_file, '3300060604.a.ko.txt');
  assert.equal(m.ko_annotation_summary.ko_terms_present, 5561);
  assert.equal(m.ko_annotation_summary.sample_prefix, 'Ga0591005');
  assert.equal(m.proteome_fasta, 'faa_3300060604.a.faa');
  assert.equal(m.proteome_fasta_prefix, 'Ga0591005');
});

test('size_enforcement echoes the size inputs and notes are present', () => {
  const m = sample();
  assert.equal(m.size_enforcement.padding_seed, 42);
  assert.equal(m.size_enforcement.padding_strategy, 'none');
  assert.ok(Array.isArray(m.notes) && m.notes.length >= 1);
});

test('null koSummary degrades gracefully', () => {
  const m = buildManifest({
    terms: [], params: {}, sizeInputs: {}, counts: {},
    koFileName: 'x.ko.txt', koSummary: null, fastaFileName: 'x.faa', fastaPrefix: null,
  });
  assert.equal(m.ko_annotation_summary, null);
  assert.equal(m.proteome_fasta_prefix, null);
});
