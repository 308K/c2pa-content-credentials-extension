// Builds the Firefox variant of the extension into dist-firefox/ from an
// existing dist/ build: swaps in the Firefox manifest (event page background,
// no offscreen permission, gecko-specific settings) and relocates vendor
// scripts out of node_modules/, which addons.mozilla.org tooling ignores.
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const backgroundHtmlPath = path.join(outputDir, 'background', 'background-ff.html');
writeFileSync(backgroundHtmlPath, rewriteVendorPaths(readFileSync(backgroundHtmlPath, 'utf8')));

// Chrome-only offscreen host page; the offscreen.js bundle itself stays
// because the Firefox background event page loads it as a module.
rmSync(path.join(outputDir, 'offscreen', 'offscreen.html'), { force: true });

console.log('Firefox build written to dist-firefox/');
console.log('Load it with: web-ext run --source-dir dist-firefox');
