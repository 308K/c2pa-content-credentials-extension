// Builds the Firefox variant of the extension into dist-firefox/ from an
// existing dist/ build: swaps in the Firefox manifest (event page background,
// no offscreen permission, gecko-specific settings) and relocates vendor
// scripts out of node_modules/, which addons.mozilla.org tooling ignores.
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractC2paWorkerSource } from './extract-c2pa-worker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'dist');
const outputDir = path.join(root, 'dist-firefox');
const firefoxManifestSource = path.join(root, 'src', 'manifest.firefox.json');

if (!existsSync(sourceDir)) {
  console.error('dist/ not found. Run `npm run build` (or `build:dev`) first.');
  process.exit(1);
}
if (!existsSync(firefoxManifestSource)) {
  console.error('src/manifest.firefox.json not found.');
  process.exit(1);
}

rmSync(outputDir, { recursive: true, force: true });
cpSync(sourceDir, outputDir, { recursive: true });

// addons-linter / web-ext skip node_modules entirely, so any manifest entry
// pointing there fails validation ("file not found"). Move the vendored
// runtime scripts to vendor/ and rewrite the references.
// ORT resolves its .wasm/.mjs assets relative to the script URL, so keeping
// all of its files together in vendor/onnxruntime/ preserves that.
const vendorDir = path.join(outputDir, 'vendor');
mkdirSync(vendorDir, { recursive: true });

const webcomponentsSource = path.join(outputDir, 'node_modules', '@webcomponents', 'webcomponentsjs', 'webcomponents-bundle.js');
renameSync(webcomponentsSource, path.join(vendorDir, 'webcomponents-bundle.js'));

const ortSourceDir = path.join(outputDir, 'node_modules', 'onnxruntime-web', 'dist');
const ortTargetDir = path.join(vendorDir, 'onnxruntime');
mkdirSync(ortTargetDir, { recursive: true });
readdirSync(ortSourceDir).forEach((file) => {
  renameSync(path.join(ortSourceDir, file), path.join(ortTargetDir, file));
});
rmSync(path.join(outputDir, 'node_modules'), { recursive: true, force: true });

const rewriteVendorPaths = (text) => text
  .replaceAll('node_modules/@webcomponents/webcomponentsjs/', 'vendor/')
  .replaceAll('node_modules/onnxruntime-web/dist/', 'vendor/onnxruntime/');

writeFileSync(
  path.join(outputDir, 'manifest.json'),
  rewriteVendorPaths(readFileSync(firefoxManifestSource, 'utf8')),
);
rmSync(path.join(outputDir, 'manifest.firefox.json'), { force: true });

// Self-hosted variant: bake update_url into the generated manifest so signed
// unlisted builds auto-update from updates.json in this repository. Kept out
// of the default build because addons.mozilla.org validation rejects
// update_url ("not allowed for Mozilla-hosted add-ons").
if (process.argv.includes('--self-host')) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.browser_specific_settings.gecko.update_url = 'https://raw.githubusercontent.com/308K/c2pa-content-credentials-extension/firefox-support/updates.json';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
  console.log('self-host: update_url injected into manifest.json');
}

const backgroundHtmlPath = path.join(outputDir, 'background', 'background-ff.html');
writeFileSync(backgroundHtmlPath, rewriteVendorPaths(readFileSync(backgroundHtmlPath, 'utf8')));

// Chrome-only offscreen host page; the offscreen.js bundle itself stays
// because the Firefox background event page loads it as a module.
rmSync(path.join(outputDir, 'offscreen', 'offscreen.html'), { force: true });

// Ship the C2PA SDK worker as a real extension file. Firefox extension pages
// cannot create blob:/data: workers (hard CSP limit), so the shim in
// background-ff.html redirects the SDK to this file.
const c2paWorkerSource = await extractC2paWorkerSource();
const c2paWorkerPath = path.join(outputDir, 'lib', 'c2pa', 'c2pa-sdk-worker.js');
mkdirSync(path.dirname(c2paWorkerPath), { recursive: true });
writeFileSync(c2paWorkerPath, c2paWorkerSource);
console.log(`C2PA SDK worker (${c2paWorkerSource.length} bytes) written to lib/c2pa/c2pa-sdk-worker.js`);

console.log('Firefox build written to dist-firefox/');
console.log('Load it with: web-ext run --source-dir dist-firefox');
