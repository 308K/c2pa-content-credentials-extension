/*
 * C2PA UI page-world renderer (Firefox only, loaded with world: "MAIN").
 *
 * Firefox gives content scripts a sandbox-private CustomElementRegistry:
 * customElements.define() seems to succeed, but elements created through the
 * (Xray-wrapped) document use the page registry and never upgrade, so the
 * c2pa-* web components render as HTMLUnknownElement. Property setters on
 * page elements are equally invisible through Xrays.
 *
 * This script therefore runs in the page world, where the components import
 * and register natively, and performs every UI DOM operation on behalf of
 * the isolated content script, which sends JSON commands through the
 * 'c2pa-ext-bridge' CustomEvent (see src/content/c2pa-ui-bridge.js).
 */
import { createC2PAComponents } from '../c2pa-ui/index.js';

const BRIDGE_EVENT = 'c2pa-ext-bridge';

const MIN_DISTANCE_FROM_LEFT_BORDER_IN_PIXELS = 365;

function getVisibleRect(element) {
  const visibleRect = element.getBoundingClientRect();
  let node = element;
  while (node.parentElement) {
    node = node.parentElement;
    const parentRect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    if (style.overflow === 'hidden' || style.overflowX === 'hidden') {
      visibleRect.left = Math.max(visibleRect.left, parentRect.left);
      visibleRect.right = Math.min(visibleRect.right, parentRect.right);
    }
    if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
      visibleRect.top = Math.max(visibleRect.top, parentRect.top);
      visibleRect.bottom = Math.min(visibleRect.bottom, parentRect.bottom);
    }
  }
  visibleRect.width = visibleRect.right - visibleRect.left;
  visibleRect.height = visibleRect.bottom - visibleRect.top;
  return visibleRect;
}

function determinePopoverPlacementSide(element) {
  const rect = getVisibleRect(element);
  if (rect.right < MIN_DISTANCE_FROM_LEFT_BORDER_IN_PIXELS) {
    return 'right';
  }
  return 'left';
}

function findMediaByBaseId(baseId) {
  return document.querySelector(
    `img[c2paId="${baseId}"], video[c2paId="${baseId}"], audio[c2paId="${baseId}"]`,
  );
}

// Page-world twin of addIconForImage in src/lib/imageUtils.js.
function addIcon(baseId) {
  const image = findMediaByBaseId(baseId);
  if (!image) {
    return;
  }
  const iconContainer = document.getElementById('icon-container');
  if (!iconContainer) {
    return;
  }
  const iconElement = document.createElement('div');
  iconElement.id = `icon-${baseId}`;
  iconElement.style.position = 'absolute';
  const rect = getVisibleRect(image);
  iconElement.style.top = `${rect.top}px`;
  iconElement.style.right = `${window.innerWidth - rect.right}px`;
  iconElement.style.pointerEvents = 'auto';

  const caiPopover = createC2PAComponents(baseId);
  caiPopover.placement = determinePopoverPlacementSide(image);
  iconElement.appendChild(caiPopover);

  iconElement.addEventListener('mouseenter', () => {
    caiPopover.placement = determinePopoverPlacementSide(image);
  });

  iconContainer.appendChild(iconElement);
}

// Page-world twin of the manifest-summary configuration section of
// displayManifest in src/lib/manifestUtils.js.
function updateManifest(payload) {
  const manifestSummary = document.getElementById(`manifest-${payload.baseId}`);
  const caiIndicator = document.getElementById(`indicator-${payload.baseId}`);
  if (!manifestSummary || !caiIndicator) {
    return;
  }
  manifestSummary.embeddedManifestStore = payload.embeddedManifestStore;
  manifestSummary.recoveredManifestStore = payload.recoveredManifestStore;
  manifestSummary.embeddedJsonManifestStore = payload.embeddedJsonManifestStore;
  manifestSummary.recoveredJsonManifestStore = payload.recoveredJsonManifestStore;
  manifestSummary.manifestStore = payload.manifestStore;
  manifestSummary.jsonManifestStore = payload.jsonManifestStore;
  manifestSummary.viewMoreUrl = payload.viewMoreUrl;
  manifestSummary.jsonManifestViewEnabled = Boolean(payload.jsonManifestViewEnabled);
  if (payload.manifestStore) {
    manifestSummary.manifestStore.thumbnail = payload.thumbnailSrc;
  }
  caiIndicator.variant = payload.variant || 'info-light';
  caiIndicator.classList.add('manifest-loaded');
}

document.addEventListener(BRIDGE_EVENT, (event) => {
  let command;
  try {
    command = JSON.parse(event.detail);
  } catch (error) {
    return;
  }
  try {
    if (command.cmd === 'addIcon') {
      addIcon(command.baseId);
    } else if (command.cmd === 'updateManifest') {
      updateManifest(command);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('c2pa-ui-page: command failed', error);
  }
});
