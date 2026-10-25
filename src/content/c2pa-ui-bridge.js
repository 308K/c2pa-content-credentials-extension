/* eslint-disable no-undef */
/*
 * Bridge from the isolated content script to the page-world C2PA UI renderer
 * (Firefox only).
 *
 * Firefox content scripts get a sandbox-private CustomElementRegistry, so the
 * c2pa-* web components never upgrade in this world and property setters on
 * page elements are invisible through Xray wrappers. On Firefox (detected via
 * the wrappedJSObject global, which only exists in Firefox sandboxes) UI work
 * is delegated to src/content/c2pa-ui-page.js, which runs with world: "MAIN".
 * Chrome and other Chromium browsers keep using the direct code path.
 */

const BRIDGE_EVENT = 'c2pa-ext-bridge';

const pageWorldAvailable = typeof wrappedJSObject !== 'undefined';

function send(command) {
  try {
    document.dispatchEvent(new CustomEvent(BRIDGE_EVENT, {
      detail: JSON.stringify(command),
    }));
    return true;
  } catch (error) {
    return false;
  }
}

export function isPageWorldUIAvailable() {
  return pageWorldAvailable;
}

export function pageAddIcon(baseId) {
  return send({ cmd: 'addIcon', baseId });
}

export function pageUpdateManifest(payload) {
  return send({ cmd: 'updateManifest', ...payload });
}
