/* Bundled KO catalog — KO id -> human-readable function name.
 *
 * Shipped as docs/data/ko_catalog.json (built by scripts/build_ko_catalog.py
 * from the KEGG REST KO list). Loaded once so the term picker can search by
 * name ("nitrogenase") and show what each Kxxxxx is, fully offline.
 */

let _cache = null;

/* Load and cache the catalog. Returns { release, count, names: Map<ko,name> }.
 * Resolves with an empty catalog (not an error) if the file is missing, so the
 * app still works in id-only mode. */
export async function loadCatalog() {
  if (_cache) return _cache;
  try {
    const res = await fetch('data/ko_catalog.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const names = new Map(Object.entries(json.terms || {}));
    _cache = { release: json.release || null, count: json.count || names.size, names };
  } catch (e) {
    console.warn('KO catalog unavailable, falling back to id-only:', e.message);
    _cache = { release: null, count: 0, names: new Map() };
  }
  return _cache;
}
