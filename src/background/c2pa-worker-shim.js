/* eslint-disable no-undef */
/* eslint-disable func-names */
// Firefox-only shim loaded by background-ff.html before the module scripts.
//
// @contentauth/c2pa-web spawns its WASM runtime as a web worker built from an
// inlined source string, using a blob:/data: URL. Firefox extension pages
// forbid blob:/data: workers under the extension CSP and this cannot be
// relaxed via the manifest, so the Firefox build ships the SDK worker source
// as a real extension file (written by scripts/make-firefox-dist.js) and this
// shim redirects the SDK's worker construction to that URL.
(function () {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
    return;
  }
  const workerUrl = chrome.runtime.getURL('lib/c2pa/c2pa-sdk-worker.js');
  const OrigWorker = window.Worker;
  if (!OrigWorker) {
    return;
  }
  function PatchedWorker(src, opts) {
    if (typeof src === 'string' && (src.indexOf('blob:') === 0 || src.indexOf('data:') === 0)) {
      // eslint-disable-next-line no-console
      console.info('c2pa-worker-shim: redirecting SDK worker to packaged extension file');
      return new OrigWorker(workerUrl, opts);
    }
    return new OrigWorker(src, opts);
  }
  PatchedWorker.prototype = OrigWorker.prototype;
  window.Worker = PatchedWorker;
}());
