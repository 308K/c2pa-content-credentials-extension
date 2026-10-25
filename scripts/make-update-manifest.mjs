// Regenerates updates.json — the Firefox self-hosting update manifest
// (https://extensionworkshop.com/documentation/manage/updating-your-extension/)
// — from src/manifest.firefox.json.
//
// The update_link intentionally uses GitHub's permanent "latest release"
// URL, so every release must upload its xpi under the SAME asset filename
// (c2pa-content-credentials-firefox.xpi); the version field in this manifest
// is what tells Firefox an update is available.
//
// Release flow:
//   1. bump version in src/manifest.firefox.json
//   2. npm run build:firefox
//   3. web-ext sign --source-dir dist-firefox --channel unlisted ...
//   4. upload the signed xpi to a new GitHub release as
//      c2pa-content-credentials-firefox.xpi
//   5. npm run update-manifest  (regenerates this file)
//   6. commit + push, tag the release
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const UPDATE_LINK = 'https://github.com/308K/c2pa-content-credentials-extension/releases/latest/download/c2pa-content-credentials-firefox.xpi';

const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'src', 'manifest.firefox.json'), 'utf8'));
const { id } = manifest.browser_specific_settings.gecko;
const updateManifest = {
  addons: {
    [id]: {
      updates: [
        {
          version: manifest.version,
          update_link: UPDATE_LINK,
        },
      ],
    },
  },
};

writeFileSync(
  path.join(repoRoot, 'updates.json'),
  `${JSON.stringify(updateManifest, null, 2)}\n`,
);
console.log(`updates.json written for ${gecko.id} @ ${manifest.version}`);
console.log(`update_link: ${UPDATE_LINK}`);
