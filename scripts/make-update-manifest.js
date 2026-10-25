// Regenerates updates.json (the Firefox self-hosting update manifest) from the
// release history recorded in it plus the current manifest.firefox.json
// version and a given update_link.
//
// Usage:
//   node scripts/make-update-manifest.js <update_link-xpi-url> [--version 0.2.2]
//
// update_link normally points at the signed .xpi attached to the matching
// GitHub release. Entries are kept newest-first; older versions are retained.
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'src', 'manifest.firefox.json');
const updatesPath = path.join(root, 'updates.json');

const args = process.argv.slice(2);
const updateLink = args.find((a) => !a.startsWith('--'));
if (!updateLink) {
  console.error('usage: node scripts/make-update-manifest.js <update_link-xpi-url> [--version X.Y.Z]');
  process.exit(1);
}
const versionArg = args.find((a) => a.startsWith('--version'));
const version = versionArg ? versionArg.split('=')[1] || args[args.indexOf(versionArg) + 1] : null;

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const addonId = manifest.browser_specific_settings.gecko.id;
const addonVersion = version || manifest.version;

let updates = { addons: {} };
try {
  updates = JSON.parse(readFileSync(updatesPath, 'utf8'));
} catch (error) {
  // First run: no updates.json yet.
}
const entries = updates.addons[addonId]?.updates || [];
const filtered = entries.filter((e) => e.version !== addonVersion);
filtered.push({ version: addonVersion, update_link: updateLink });

const compareVersions = (a, b) => {
  const pa = a.version.split('.').map(Number);
  const pb = b.version.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
};
filtered.sort(compareVersions);

const output = {
  addons: {
    [addonId]: { updates: filtered },
  },
};
writeFileSync(updatesPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`updates.json: ${filtered.length} entries, newest = ${filtered[0].version}`);
