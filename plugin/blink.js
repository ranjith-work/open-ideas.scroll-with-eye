// Both eyes must close and open again. One blink is ignored by the page.
// A second blink inside the window is the select gesture.

export function createBlinkDetector({
  high = 0.55,
  low = 0.3,
  minClosedMs = 50,
  maxClosedMs = 400,
  doubleWindowMs = 450,
} = {}) {
  let phase = 'open';
  let closedAt = 0;
  let lastBlinkAt = 0;
  let armed = false;

  function disarmIfStale(now) {
    if (armed && now - lastBlinkAt > doubleWindowMs) armed = false;
  }

  return {
    update(left, right, now) {
      const closed = left >= high && right >= high;
      const opened = left <= low && right <= low;

      if (phase === 'open') {
        disarmIfStale(now);
        if (closed) {
          phase = 'closed';
          closedAt = now;
        }
        return null;
      }

      if (!opened) return null;

      phase = 'open';
      const duration = now - closedAt;
      if (duration < minClosedMs || duration > maxClosedMs) return null;

      if (armed && now - lastBlinkAt <= doubleWindowMs) {
        armed = false;
        lastBlinkAt = 0;
        return 'double';
      }

      armed = true;
      lastBlinkAt = now;
      return 'blink';
    },

    reset() {
      phase = 'open';
      closedAt = 0;
      lastBlinkAt = 0;
      armed = false;
    },
  };
}

// The lids cover the iris while an eye closes, and the tracker reads that as
// a jump. The gate says when gaze must be ignored: from the moment either
// eye starts to close until holdMs after both are open again.
export function createBlinkGate({ threshold = 0.4, holdMs = 150 } = {}) {
  let shut = false;
  let releasedAt = -Infinity;

  return {
    update(left, right, now) {
      if (left >= threshold || right >= threshold) {
        shut = true;
        return true;
      }
      if (shut) {
        shut = false;
        releasedAt = now;
      }
      return now - releasedAt < holdMs;
    },

    get shut() {
      return shut;
    },

    reset() {
      shut = false;
      releasedAt = -Infinity;
    },
  };
}
