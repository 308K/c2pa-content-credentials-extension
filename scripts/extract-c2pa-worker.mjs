// Extracts the C2PA SDK's embedded web worker source into a real file.
//
// @contentauth/c2pa-web always spawns its WASM runtime in a web worker built
// from an inlined source string via a blob:/data: URL. Firefox extension
// pages forbid blob:/data: workers under the extension CSP (and it cannot be
// relaxed), so the Firefox build ships the worker source as a real extension
// file (lib/c2pa/c2pa-sdk-worker.js) and c2pa-worker-shim.js redirects the
// SDK's worker construction to it.
//
// To get the exact worker source we import the SDK's dist chunk in Node with
// URL.createObjectURL hooked: createC2pa() builds the worker Blob and hands
// it to createObjectURL before ever touching browser-only APIs, which is
// where we capture it. The subsequent Worker construction throws (no Worker
// in Node) and is expected.
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export async function extractC2paWorkerSource() {
  const captured = [];

  globalThis.self = globalThis;
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = (obj) => {
    if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Blob') {
      captured.push(obj);
    }
    throw new Error('extract: stop after capture');
  };

  try {
    // Valid package exports subpath; the eslint resolver does not
    // understand the exports map.
    // eslint-disable-next-line import/no-unresolved
    const sdk = await import('@contentauth/c2pa-web');
    // Hand createC2pa a pre-compiled (empty) WebAssembly.Module: the SDK only
    // fetches wasmSrc when it is a string, and this way the worker blob is
    // captured before any browser-only API is touched.
    const emptyModule = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    await sdk.createC2pa({ wasmSrc: emptyModule });
  } catch (error) {
    // Expected: Worker construction fails in Node after the blob is captured.
  } finally {
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    } else {
      delete URL.createObjectURL;
    }
    delete globalThis.self;
  }

  if (captured.length === 0) {
    throw new Error('Failed to capture the C2PA SDK worker blob');
  }
  const source = await captured[0].text();
  if (!source || source.length < 1000) {
    throw new Error(`Captured C2PA SDK worker blob looks wrong (${source.length} bytes)`);
  }
  return source;
}

// CLI usage: node scripts/extract-c2pa-worker.mjs <output-path>
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/extract-c2pa-worker.mjs <output-path>');
    process.exit(1);
  }
  const source = await extractC2paWorkerSource();
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, source);
  console.log(`C2PA SDK worker source (${source.length} bytes) written to ${out}`);
}
