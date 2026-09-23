// Hit testing uses viewport rectangles so the plugin can run it every frame
// without depending on elementFromPoint (the reticle would sit on top).

export function sectionLabel(section) {
  const name = section?.id?.trim();
  return name || (section ? 'Section' : 'Page');
}

export function measureSections(elements) {
  const rects = [];
  for (const element of elements) {
    if (!element || typeof element.getBoundingClientRect !== 'function') continue;
    const rect = element.getBoundingClientRect();
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    if (width < 2 || height < 2) continue;
    const name = (element.getAttribute?.('data-eye-section') || '').trim();
    rects.push({
      element,
      id: name,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  return rects;
}

// Rectangles measured at one scroll position, moved to another. This is what
// lets the page scroll for a second without measuring layout again.
export function offsetRects(rects, dx, dy) {
  if (!dx && !dy) return rects;
  return (rects || []).map((rect) => ({
    ...rect,
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy,
  }));
}

export function sectionAtPoint(x, y, rects) {
  let best = null;
  let bestArea = Infinity;
  for (const rect of rects || []) {
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    const area = (rect.right - rect.left) * (rect.bottom - rect.top);
    if (area <= bestArea) {
      best = rect;
      bestArea = area;
    }
  }
  return best;
}
