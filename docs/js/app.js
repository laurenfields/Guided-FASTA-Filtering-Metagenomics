/* Guided FASTA Filtering — Metaproteomics — UI orchestration.
 *
 * Flow: load KO annotation table -> pick KO term(s) -> set size/padding ->
 * load proteome FASTA -> filter in-browser -> download tailored FASTA +
 * manifest (+ gene->KO map). KO term -> gene resolution is a local join
 * against the uploaded annotation file; nothing is uploaded anywhere.
 */

import { parseKoAnnotation, genesForKos, genePrefix } from './ko.js';
import { loadCatalog } from './kocatalog.js';
import { indexFasta, emitFasta } from './fasta.js';
import { filterLibraryTsv } from './library.js';
import { randomPad } from './padding.js';
import { buildManifest } from './manifest.js';

const $ = (id) => document.getElementById(id);

const state = {
  catalog: { release: null, names: new Map() },
  sample: null,               // parseKoAnnotation() result, or null
  koFileName: null,
  searchEntries: [],          // [{id, name, genes}] for KO terms present in the sample
  suggestions: [],
  activeSuggestion: -1,
  picked: [],                 // [{id, name, genes}]
  seedGenes: [],              // genes from picked KO terms (sorted, cap-priority)
  cappedCount: 0,
  paddedGenes: [],
  finalGenes: new Set(),
  fastaRecords: null,         // Map geneId -> record string
  fastaPool: [],              // all gene ids present in the FASTA
  fastaPrefix: null,
  fastaFileName: null,
  libraryFile: null,          // optional DIA-NN library File (streamed at generate time)
};

/* ------------------------------------------------------------------ utils */

function setStatus(id, msg, cls = '') {
  const el = $(id);
  el.textContent = msg || '';
  el.className = 'status' + (cls ? ' ' + cls : '');
}

function intVal(id) {
  const n = parseInt($(id).value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ------------------------------------------------------------- KO file load */

async function onKoLoad(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  setStatus('ko-status', `Reading ${file.name}…`);
  try {
    const text = await file.text();
    const sample = parseKoAnnotation(text);
    if (!sample.koCount) throw new Error('No KO:Kxxxxx annotations found in this file.');
    state.sample = sample;
    state.koFileName = file.name;

    // Build the searchable term list: KO ids present in the sample, named from the catalog.
    state.searchEntries = sample.koList.map((k) => ({
      id: k.id,
      name: state.catalog.names.get(k.id) || '',
      genes: k.genes,
    }));

    // Picks made against a previous sample are no longer valid.
    state.picked = [];
    renderPicked();

    $('query').disabled = false;
    $('query').placeholder = 'start typing, e.g. nitrogenase, K02588, dsrA…';
    setStatus('ko-status',
      `${file.name}: ${sample.geneCount.toLocaleString()} annotated genes, `
      + `${sample.koCount.toLocaleString()} KO terms `
      + `(sample prefix ${sample.prefix}).`, 'ok');
    recompute();
    maybeWarnPrefixMismatch();
  } catch (e) {
    state.sample = null;
    state.searchEntries = [];
    $('query').disabled = true;
    $('query').placeholder = 'load a KO file first…';
    setStatus('ko-status', 'Failed to read KO file: ' + e.message, 'err');
    recompute();
  }
  updateGenerateGate();
}

/* --------------------------------------------------------- typeahead search */

let debounceTimer = null;

function onQueryInput() {
  const q = $('query').value.trim();
  clearTimeout(debounceTimer);
  if (!state.sample || q.length < 2) { closeSuggestions(); setStatus('search-status', ''); return; }
  debounceTimer = setTimeout(() => runSearch(q), 120);
}

/* Local search over the sample's KO terms, matching id or name (case-insensitive).
 * Exact-id and name-prefix matches rank first; ties broken by gene count. */
function runSearch(q) {
  const needle = q.toLowerCase();
  const pickedIds = new Set(state.picked.map((t) => t.id));
  const scored = [];
  for (const e of state.searchEntries) {
    if (pickedIds.has(e.id)) continue;
    const id = e.id.toLowerCase();
    const name = e.name.toLowerCase();
    let rank;
    if (id === needle) rank = 0;
    else if (id.startsWith(needle)) rank = 1;
    else if (name.startsWith(needle)) rank = 2;
    else if (name.includes(needle) || id.includes(needle)) rank = 3;
    else continue;
    scored.push({ e, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || b.e.genes - a.e.genes
    || (a.e.id < b.e.id ? -1 : 1));
  state.suggestions = scored.slice(0, 25).map((s) => s.e);
  state.activeSuggestion = -1;
  renderSuggestions();
  setStatus('search-status', state.suggestions.length ? '' : 'No matching KO term in this sample.',
    state.suggestions.length ? '' : 'warn');
}

function renderSuggestions() {
  const box = $('suggestions');
  box.innerHTML = '';
  if (!state.suggestions.length) { box.classList.add('hidden'); return; }
  state.suggestions.forEach((t, i) => {
    const li = document.createElement('li');
    if (i === state.activeSuggestion) li.classList.add('active');
    const name = document.createElement('span');
    name.textContent = (t.name || '(no catalog name)') + '  ';
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = `${t.id} · ${t.genes} gene${t.genes === 1 ? '' : 's'}`;
    li.append(name, m);
    li.addEventListener('mousedown', (ev) => { ev.preventDefault(); addPicked(t); });
    box.append(li);
  });
  box.classList.remove('hidden');
}

function closeSuggestions() {
  state.suggestions = [];
  state.activeSuggestion = -1;
  $('suggestions').classList.add('hidden');
  $('suggestions').innerHTML = '';
}

function onQueryKeydown(e) {
  const n = state.suggestions.length;
  if (e.key === 'ArrowDown' && n) {
    e.preventDefault();
    state.activeSuggestion = (state.activeSuggestion + 1) % n;
    renderSuggestions();
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault();
    state.activeSuggestion = (state.activeSuggestion - 1 + n) % n;
    renderSuggestions();
  } else if (e.key === 'Enter' && n) {
    e.preventDefault();
    const idx = state.activeSuggestion >= 0 ? state.activeSuggestion : 0;
    addPicked(state.suggestions[idx]);
  } else if (e.key === 'Escape') {
    closeSuggestions();
  }
}

/* ------------------------------------------------------------ picked terms */

function addPicked(term) {
  if (!state.picked.some((t) => t.id === term.id)) {
    state.picked.push({ id: term.id, name: term.name, genes: term.genes });
  }
  $('query').value = '';
  closeSuggestions();
  setStatus('search-status', '');
  renderPicked();
  recompute();
  $('query').focus();
}

function removePicked(id) {
  state.picked = state.picked.filter((t) => t.id !== id);
  renderPicked();
  recompute();
}

function renderPicked() {
  const box = $('picked');
  box.innerHTML = '';
  for (const t of state.picked) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = t.name || t.id;
    const meta = document.createElement('span');
    meta.className = 'chip-meta';
    meta.textContent = `${t.id} · ${t.genes}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Remove';
    btn.addEventListener('click', () => removePicked(t.id));
    chip.append(label, meta, btn);
    box.append(chip);
  }
  $('m-terms').textContent = state.picked.length;
}

/* ----------------------------------------------------- resolve + size enforce */

/* Recompute the gene set from the current picks, cap, and padding. Local and
 * instant — there is no remote resolve step. */
function recompute() {
  if (!state.sample || !state.picked.length) {
    state.seedGenes = [];
    state.cappedCount = 0;
    state.paddedGenes = [];
    state.finalGenes = new Set();
    $('m-genes').textContent = '0';
    $('m-pad').textContent = '0';
    $('m-final').textContent = '0';
    setStatus('metrics-note', '');
    updateGenerateGate();
    return;
  }

  // Union of genes across picked KO terms; sorted for a reproducible cap order.
  const union = genesForKos(state.picked.map((t) => t.id), state.sample.koToGenes);
  const ranked = [...union].sort();
  state.seedGenes = ranked;

  const maxP = intVal('max-proteins');
  const capped = (maxP > 0 && ranked.length > maxP) ? ranked.slice(0, maxP) : ranked.slice();
  state.cappedCount = capped.length;

  const minP = intVal('min-proteins');
  const strategy = $('padding-strategy').value;
  const seed = intVal('padding-seed');
  const need = Math.max(minP - capped.length, 0);

  let padded = [];
  if (strategy === 'random' && need > 0 && state.fastaPool.length) {
    padded = randomPad(state.fastaPool, new Set(capped), need, seed);
  }
  state.paddedGenes = padded;
  state.finalGenes = new Set([...capped, ...padded]);

  const willPad = strategy === 'random' ? need : 0;
  $('m-genes').textContent = ranked.length.toLocaleString();
  $('m-pad').textContent = willPad.toLocaleString();
  $('m-final').textContent = (capped.length + (strategy === 'random' ? padded.length : 0)).toLocaleString();

  const notes = [];
  if (maxP > 0 && ranked.length > maxP) notes.push(`capped ${ranked.length}→${maxP}`);
  if (willPad > 0 && !state.fastaPool.length) notes.push('load a FASTA to materialize padding');
  if (willPad > 0 && state.fastaPool.length && padded.length < willPad) {
    notes.push(`pool exhausted: padded ${padded.length}/${willPad}`);
  }
  setStatus('metrics-note', notes.join(' · '), notes.length ? 'warn' : '');
  updateGenerateGate();
}

/* ------------------------------------------------------------------ FASTA */

async function onFastaLoad(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  setStatus('fasta-status', `Reading ${file.name} (${(file.size / 1e6).toFixed(0)} MB)…`);
  try {
    const text = await file.text();
    state.fastaRecords = indexFasta(text);
    state.fastaPool = [...state.fastaRecords.keys()];
    state.fastaFileName = file.name;
    state.fastaPrefix = state.fastaPool.length ? genePrefix(state.fastaPool[0]) : null;
    setStatus('fasta-status',
      `${file.name}: ${state.fastaPool.length.toLocaleString()} proteins indexed `
      + `(prefix ${state.fastaPrefix}).`, 'ok');
    recompute();
    maybeWarnPrefixMismatch();
  } catch (e) {
    state.fastaRecords = null;
    state.fastaPool = [];
    state.fastaPrefix = null;
    setStatus('fasta-status', 'Failed to read FASTA: ' + e.message, 'err');
  }
  updateGenerateGate();
}

/* The DIA-NN library is optional and can be multi-GB, so it is not read here —
 * just held and streamed at generate time. */
function onLibraryLoad(ev) {
  const file = ev.target.files[0];
  state.libraryFile = file || null;
  setStatus('library-status',
    file ? `${file.name} (${(file.size / 1e6).toFixed(1)} MB) ready — filtered when you generate.` : '',
    file ? 'ok' : '');
}

/* Warn (don't block) when the KO file and FASTA appear to be from different
 * samples — their gene-id prefixes won't join. */
function maybeWarnPrefixMismatch() {
  if (!state.sample || !state.fastaPrefix) return;
  if (state.sample.prefix && state.fastaPrefix !== state.sample.prefix) {
    setStatus('fasta-status',
      `Heads up: FASTA prefix "${state.fastaPrefix}" ≠ KO-file prefix `
      + `"${state.sample.prefix}". These look like different samples — gene ids `
      + `won't match. Use the .faa and .ko.txt from the same assembly.`, 'warn');
  }
}

/* --------------------------------------------------------------- generate */

function updateGenerateGate() {
  $('generate-btn').disabled = !(
    state.sample && state.picked.length && state.fastaRecords && state.finalGenes.size > 0
  );
}

async function doGenerate() {
  $('generate-btn').disabled = true;
  setStatus('generate-status', 'Filtering FASTA…');
  $('downloads').innerHTML = '';
  $('manifest-preview').classList.add('hidden');
  try {
    recompute(); // ensure padding reflects the loaded FASTA

    const { text: fastaText, matched, missing } = emitFasta(state.finalGenes, state.fastaRecords);

    // gene -> KO TSV for the matched genes (provenance the user can re-check).
    const mapLines = ['gene_id\tko_terms'];
    for (const g of matched) {
      const kos = state.sample.geneToKos.get(g) || [];
      mapLines.push(`${g}\t${kos.join(';')}`);
    }
    const mapTsv = mapLines.join('\n') + '\n';

    // Optional: stream + filter a DIA-NN spectral library to the selected genes.
    let libraryInfo = null;
    let libraryTsv = null;
    if (state.libraryFile) {
      setStatus('generate-status', 'Streaming + filtering library .tsv…');
      const res = await filterLibraryTsv(
        state.libraryFile, state.finalGenes,
        (read, total) => {
          const pct = total ? ((read / total) * 100).toFixed(0) : '?';
          setStatus('generate-status', `Filtering library… ${pct}%`);
        }
      );
      libraryTsv = res.tsv;
      libraryInfo = {
        fileName: state.libraryFile.name,
        proteinColumn: res.proteinColumn,
        keptRows: res.keptRows,
        totalRows: res.totalRows,
        proteinGroups: res.proteinGroups,
      };
    }

    const manifest = buildManifest({
      terms: state.picked,
      params: {
        present_in_sample_only: true,
        catalog_release: state.catalog.release,
      },
      sizeInputs: {
        minProteins: intVal('min-proteins'),
        maxProteins: intVal('max-proteins'),
        paddingStrategy: $('padding-strategy').value,
        paddingSeed: intVal('padding-seed'),
      },
      counts: {
        seed: state.cappedCount,
        padded: state.paddedGenes.length,
        final: state.finalGenes.size,
        matchedInFasta: matched.size,
        missingFromFasta: missing.size,
      },
      koFileName: state.koFileName,
      koSummary: state.sample,
      fastaFileName: state.fastaFileName,
      fastaPrefix: state.fastaPrefix,
      library: libraryInfo,
    });

    renderDownloads(fastaText, mapTsv, libraryTsv, manifest);
    $('manifest-json').textContent = JSON.stringify(manifest, null, 2);
    $('manifest-preview').classList.remove('hidden');

    const warn = missing.size
      ? ` (${missing.size} selected gene(s) not found in your FASTA — sample mismatch?)` : '';
    let libNote = '';
    if (libraryInfo) {
      libNote = ` Library: ${libraryInfo.keptRows.toLocaleString()}/`
        + `${libraryInfo.totalRows.toLocaleString()} rows kept, `
        + `${libraryInfo.proteinGroups.toLocaleString()} protein group(s).`;
    }
    setStatus('generate-status',
      `Done: ${matched.size.toLocaleString()} proteins in tailored FASTA${warn}.${libNote}`, 'ok');
  } catch (e) {
    setStatus('generate-status', e.message, 'err');
  } finally {
    updateGenerateGate();
  }
}

function renderDownloads(fastaText, mapTsv, libraryTsv, manifest) {
  const box = $('downloads');
  box.innerHTML = '';
  const stamp = new Date().toISOString().slice(0, 10);
  const add = (label, content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.textContent = label;
    box.append(a);
  };
  add('Download FASTA', fastaText, `tailored_${stamp}.faa`, 'text/plain');
  add('Download gene→KO map .tsv', mapTsv, `tailored_gene_ko_${stamp}.tsv`, 'text/tab-separated-values');
  if (libraryTsv) {
    add('Download library .tsv', libraryTsv, `tailored_library_${stamp}.tsv`, 'text/tab-separated-values');
  }
  add('Download manifest .json', JSON.stringify(manifest, null, 2),
    `manifest_${stamp}.json`, 'application/json');
}

/* --------------------------------------------------------------- wiring */

async function init() {
  state.catalog = await loadCatalog();

  $('ko-file').addEventListener('change', onKoLoad);
  $('query').addEventListener('input', onQueryInput);
  $('query').addEventListener('keydown', onQueryKeydown);
  $('query').addEventListener('blur', () => setTimeout(closeSuggestions, 150));
  $('fasta-file').addEventListener('change', onFastaLoad);
  $('library-file').addEventListener('change', onLibraryLoad);
  $('generate-btn').addEventListener('click', doGenerate);

  ['min-proteins', 'max-proteins', 'padding-strategy', 'padding-seed'].forEach((id) =>
    $(id).addEventListener('input', recompute));

  const note = state.catalog.count
    ? `KO catalog loaded (${state.catalog.count.toLocaleString()} terms, ${state.catalog.release}).`
    : 'KO catalog unavailable — search by K-number only.';
  setStatus('search-status', '');
  console.info(note);
}

init();
