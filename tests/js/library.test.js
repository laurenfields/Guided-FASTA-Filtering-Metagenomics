/* Unit tests for docs/js/library.js — streamed DIA-NN library filtering.
 * Uses the global File/Blob/TextDecoderStream web APIs (Node >= 18). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterLibraryTsv } from '../../docs/js/library.js';

const LIB = [
  'PrecursorMz\tProtein.Ids\tPeptide',
  '500.0\tGa0591005_1_1_99\tAAA',
  '601.2\tGa0591005_1_1_99;PARALOG\tBBB',
  '700.3\tGa0591005_9_9_99\tCCC',
  '480.1\tGa0591005_3_1_99\tDDD',
  '512.0\t\tEEE',
].join('\n') + '\n';

const fileOf = (text, name = 'lib.tsv') =>
  new File([text], name, { type: 'text/tab-separated-values' });

test('keeps rows whose protein column contains a selected gene', async () => {
  const res = await filterLibraryTsv(
    fileOf(LIB), new Set(['Ga0591005_1_1_99', 'Ga0591005_3_1_99']));
  assert.equal(res.proteinColumn, 'Protein.Ids');
  assert.equal(res.totalRows, 5);
  assert.equal(res.keptRows, 3);                 // rows 1, 2 (via _1_1_99), 4
  const lines = res.tsv.trim().split('\n');
  assert.equal(lines.length, 4);                 // header + 3 kept
  assert.ok(lines[0].startsWith('PrecursorMz'));
  assert.ok(!res.tsv.includes('Ga0591005_9_9_99'));
});

test('proteinGroups counts distinct protein-column strings among kept rows', async () => {
  const res = await filterLibraryTsv(fileOf(LIB), new Set(['Ga0591005_1_1_99']));
  // 'Ga0591005_1_1_99' and 'Ga0591005_1_1_99;PARALOG' are two distinct group strings
  assert.equal(res.keptRows, 2);
  assert.equal(res.proteinGroups, 2);
});

test('matches gene ids verbatim (no UniProt isoform trimming)', async () => {
  // a gene id containing a hyphen must still match exactly — the metaproteomics
  // adaptation dropped the original tool's `.split("-")[0]`.
  const lib = 'Protein.Ids\tPeptide\nGa-weird-1\tAAA\nGa0591005_2\tBBB\n';
  const res = await filterLibraryTsv(fileOf(lib), new Set(['Ga-weird-1']));
  assert.equal(res.keptRows, 1);
  assert.ok(res.tsv.includes('Ga-weird-1'));
});

test('handles a file with no trailing newline', async () => {
  const lib = 'Protein.Ids\tPeptide\nGa0591005_1\tAAA';   // no final \n
  const res = await filterLibraryTsv(fileOf(lib), new Set(['Ga0591005_1']));
  assert.equal(res.keptRows, 1);
});

test('throws when no recognised protein column is present', async () => {
  const lib = 'colA\tcolB\n1\t2\n';
  await assert.rejects(() => filterLibraryTsv(fileOf(lib), new Set(['x'])), /No protein column/);
});

test('falls back to Protein.Group when Protein.Ids is absent', async () => {
  const lib = 'Protein.Group\tPeptide\nGa0591005_1;Ga0591005_2\tAAA\nGaX\tBBB\n';
  const res = await filterLibraryTsv(fileOf(lib), new Set(['Ga0591005_2']));
  assert.equal(res.proteinColumn, 'Protein.Group');
  assert.equal(res.keptRows, 1);
});
