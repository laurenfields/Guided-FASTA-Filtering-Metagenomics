/* Unit tests for docs/js/ko.js — KO annotation parsing + resolution. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKoAnnotation, genePrefix, genesForKos } from '../../docs/js/ko.js';

/* A small, realistic IMG/JGI KO table:
 *   - K01945 on 2 genes
 *   - K00099 shares gene _2 (a gene with two KO terms)
 *   - K19664 on 1 gene
 *   - one malformed row and one non-KO row that must be ignored */
const KO = [
  'Ga0591005_1_1_99\tYes\tKO:K01945\t99\t1\t1\t1\t1\t0\t1\t1',
  'Ga0591005_2_1_99\tYes\tKO:K01945\t99\t1\t1\t1\t1\t0\t1\t1',
  'Ga0591005_2_1_99\tYes\tKO:K00099\t88\t1\t1\t1\t1\t0\t1\t1',
  'Ga0591005_3_1_99\tYes\tKO:K19664\t77\t1\t1\t1\t1\t0\t1\t1',
  'Ga0591005_4_1_99\tYes\tno-hit',            // no KO field -> skip
  'malformed line without tabs',              // too few columns -> skip
  '',                                         // blank -> skip
].join('\n') + '\n';

test('genePrefix extracts the assembly prefix', () => {
  assert.equal(genePrefix('Ga0591005_0000001_5492_6121'), 'Ga0591005');
  assert.equal(genePrefix('nounderscore'), 'nounderscore');
});

test('parseKoAnnotation counts genes, KO terms and rows', () => {
  const s = parseKoAnnotation(KO);
  assert.equal(s.geneCount, 3);       // genes _1, _2, _3
  assert.equal(s.koCount, 3);         // K01945, K00099, K19664
  assert.equal(s.rowCount, 4);        // 4 valid KO rows
  assert.equal(s.prefix, 'Ga0591005');
});

test('parseKoAnnotation builds correct KO -> gene sets', () => {
  const s = parseKoAnnotation(KO);
  assert.deepEqual([...s.koToGenes.get('K01945')].sort(),
    ['Ga0591005_1_1_99', 'Ga0591005_2_1_99']);
  assert.deepEqual([...s.koToGenes.get('K19664')], ['Ga0591005_3_1_99']);
});

test('parseKoAnnotation records multiple KO terms per gene', () => {
  const s = parseKoAnnotation(KO);
  assert.deepEqual(s.geneToKos.get('Ga0591005_2_1_99').sort(), ['K00099', 'K01945']);
  assert.deepEqual(s.geneToKos.get('Ga0591005_1_1_99'), ['K01945']);
});

test('koList is sorted by id with per-term gene counts', () => {
  const s = parseKoAnnotation(KO);
  assert.deepEqual(s.koList, [
    { id: 'K00099', genes: 1 },
    { id: 'K01945', genes: 2 },
    { id: 'K19664', genes: 1 },
  ]);
});

test('parseKoAnnotation ignores malformed and non-KO rows', () => {
  const s = parseKoAnnotation(KO);
  assert.equal(s.geneToKos.has('Ga0591005_4_1_99'), false);
});

test('parseKoAnnotation handles the KO: prefix case-insensitively', () => {
  const s = parseKoAnnotation('g1\tYes\tko:K00001\t1\t1\t1\t1\t1\t0\t1\t1\n');
  assert.equal(s.koCount, 1);
  assert.ok(s.koToGenes.has('K00001'));
});

test('genesForKos unions genes across terms and dedupes', () => {
  const s = parseKoAnnotation(KO);
  const union = genesForKos(['K01945', 'K00099'], s.koToGenes);
  // _1 and _2 from K01945, _2 again from K00099 -> {_1, _2}
  assert.deepEqual([...union].sort(), ['Ga0591005_1_1_99', 'Ga0591005_2_1_99']);
});

test('genesForKos ignores KO terms not present in the sample', () => {
  const s = parseKoAnnotation(KO);
  const union = genesForKos(['K99999'], s.koToGenes);
  assert.equal(union.size, 0);
});
