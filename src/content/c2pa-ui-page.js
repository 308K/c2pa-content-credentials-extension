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
  // Copy into a plain object: assigning to the DOMRect returned by
  // getBoundingClientRect() throws in strict-mode Firefox once an
  // overflow:hidden ancestor is reached, killing icon placement entirely
  // (ChatGPT et al.); Chrome tolerated the assignment, which is why this
  // only broke on some sites.
  const br = element.getBoundingClientRect();
  const visibleRect = {
    top: br.top,
    bottom: br.bottom,
    left: br.left,
    right: br.right,
    width: br.width,
    height: br.height,
  };
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

// SPA viewers (ChatGPT lightbox, carousels) routinely replace <img> nodes,
// leaving the tagged element detached; its rect then reads all zeros and the
// icon would be positioned off screen. Prefer a live, visible <img> showing
// the same resource instead.
function isPlacedInView(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0
    && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function findLiveImageBySrc(src) {
  if (!src) {
    return null;
  }
  let best = null;
  let bestArea = 0;
  document.querySelectorAll(`img[src="${CSS.escape(src)}"], img[currentSrc="${CSS.escape(src)}"]`)
    .forEach((candidate) => {
      if (!isPlacedInView(candidate)) {
        return;
      }
      const rect = candidate.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = candidate;
        bestArea = area;
      }
    });
  return best;
}

function resolveIconTarget(baseId, src) {
  const tagged = findMediaByBaseId(baseId);
  if (tagged && tagged.tagName !== 'AUDIO' && isPlacedInView(tagged)) {
    return tagged;
  }
  const live = findLiveImageBySrc(src);
  if (live) {
    return live;
  }
  return tagged && tagged.tagName !== 'AUDIO' ? tagged : null;
}

// Page-world twin of addIconForImage in src/lib/imageUtils.js.
function addIcon(baseId, src) {
  const image = resolveIconTarget(baseId, src);
  if (!image) {
    // eslint-disable-next-line no-console
    console.warn('c2pa-ui-page: no image found for icon', baseId, src);
    return;
  }
  const iconContainer = document.getElementById('icon-container');
  if (!iconContainer) {
    // eslint-disable-next-line no-console
    console.warn('c2pa-ui-page: icon container missing');
    return;
  }
  const iconElement = document.createElement('div');
  iconElement.id = `icon-${baseId}`;
  iconElement.style.position = 'absolute';
  const rect = getVisibleRect(image);
  // Clamp into the viewport: overflow clamping and detached elements can
  // otherwise yield coordinates outside the window, hiding the icon.
  const top = Math.min(Math.max(rect.top, 8), Math.max(window.innerHeight - 56, 8));
  const right = Math.min(
    Math.max(window.innerWidth - rect.right, 8),
    Math.max(window.innerWidth - 56, 8),
  );
  iconElement.style.top = `${top}px`;
  iconElement.style.right = `${right}px`;
  iconElement.style.pointerEvents = 'auto';

  const caiPopover = createC2PAComponents(baseId);
  caiPopover.placement = determinePopoverPlacementSide(image);
  iconElement.appendChild(caiPopover);

  iconElement.addEventListener('mouseenter', () => {
    caiPopover.placement = determinePopoverPlacementSide(image);
  });

  iconContainer.appendChild(iconElement);
  // eslint-disable-next-line no-console
  console.info('c2pa-ui-page: icon placed', baseId, 'top', top, 'right', right);
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
      addIcon(command.baseId, command.src);
    } else if (command.cmd === 'updateManifest') {
      updateManifest(command);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('c2pa-ui-page: command failed', error);
  }
});
