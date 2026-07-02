/* Unit tests for docs/js/fasta.js — FASTA parsing + filtering. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerGeneId, indexFasta, emitFasta } from '../../docs/js/fasta.js';

const FAA = [
  '>Ga0591005_1_1_99 # Prodigal v2.6.3 # 1 # 99 # + # tt=11',
  'MAAAA',
  'KKKKK',
  '>Ga0591005_2_1_99 # Prodigal',
  'MBBBB',
  '>Ga0591005_3_1_99 # Prodigal',
  'MCCCC',
].join('\n') + '\n';

test('headerGeneId returns the first whitespace token verbatim', () => {
  assert.equal(headerGeneId('Ga0591005_1_1_99 # Prodigal v2.6.3'), 'Ga0591005_1_1_99');
  assert.equal(headerGeneId('Ga0591005_9_1_2802'), 'Ga0591005_9_1_2802');
});

test('indexFasta parses every record keyed by gene id', () => {
  const recs = indexFasta(FAA);
  assert.equal(recs.size, 3);
  assert.ok(recs.has('Ga0591005_1_1_99'));
  assert.ok(recs.has('Ga0591005_3_1_99'));
});

test('indexFasta preserves multi-line sequences and the header', () => {
  const recs = indexFasta(FAA);
  const rec = recs.get('Ga0591005_1_1_99');
  assert.ok(rec.startsWith('>Ga0591005_1_1_99 # Prodigal'));
  assert.ok(rec.includes('MAAAA\nKKKKK'));
  assert.ok(rec.endsWith('\n'));
});

test('indexFasta lets a later duplicate id overwrite an earlier one', () => {
  const dup = '>g1 a\nAAA\n>g1 b\nCCC\n';
  const recs = indexFasta(dup);
  assert.equal(recs.size, 1);
  assert.ok(recs.get('g1').includes('CCC'));
});

test('emitFasta returns matched records and tracks missing ids', () => {
  const recs = indexFasta(FAA);
  const { text, matched, missing } = emitFasta(
    new Set(['Ga0591005_1_1_99', 'Ga0591005_3_1_99', 'Ga0591005_absent']), recs);
  assert.deepEqual([...matched].sort(), ['Ga0591005_1_1_99', 'Ga0591005_3_1_99']);
  assert.deepEqual([...missing], ['Ga0591005_absent']);
  // exactly the two matched records, nothing else
  assert.equal((text.match(/^>/gm) || []).length, 2);
  assert.ok(text.includes('MAAAA'));
  assert.ok(text.includes('MCCCC'));
  assert.ok(!text.includes('MBBBB'));
});

test('emitFasta on an empty selection yields empty text', () => {
  const recs = indexFasta(FAA);
  const { text, matched, missing } = emitFasta(new Set(), recs);
  assert.equal(text, '');
  assert.equal(matched.size, 0);
  assert.equal(missing.size, 0);
});
