# Scroll-With-Eye

Look toward the edge of the screen and the page scrolls. Double-blink a section and that section scrolls instead, including sideways when it overflows.

The camera stays in the browser. Video is not uploaded.

```
npm start
```

Open the address it prints. Click **Start** and allow the camera. Look at the middle of the screen until the status changes. The camera sits above the screen, so that look is saved as center. The first start also downloads the eye model, so it needs a network once.

Chrome or Edge is the reliable pair for the camera and the tracker.

## What to try

1. Look down. The long page moves. Look back to the middle and it stops.
2. Put the ring on the card row until it outlines in lime, then blink twice. The panel should say it is scrolling the card row. Look left and right.
3. Do the same on the board. It moves both ways. Double-blink with the ring on empty page to give scroll back to the document.

## Add it to a page

Serve `plugin/` next to the page, or copy those files onto the same origin. The page needs a click before the camera can open. `EyeScroll.start` draws the panel that provides that click.

```html
<script type="module">
  import { EyeScroll } from "/plugin/eye-scroll.js";
  EyeScroll.start({ sectionSelector: "[data-eye-section]" });
</script>

<section data-eye-section="Gallery" style="overflow: auto">...</section>
```

The attribute value is the name shown in the panel. Any element matching the selector can be selected. The document scrolls when nothing is selected.

`start` returns `{ stop }`, which closes the camera and removes the panel.

## How a look becomes a scroll

MediaPipe Face Landmarker reads the webcam:

- The iris is measured inside each eye. Turning or shifting the head, with the eyes still centered in their sockets, does not scroll. Moving the eyes does.
- That iris position is smoothed so it does not jitter.
- The first moment of tracking is saved as the center. Scroll is measured from that, not from the camera, which otherwise reads a look at the screen as looking down.
- The area around that center is a dead zone.
- Past the dead zone, speed rises with how far the eyes have travelled.
- Both eyes closing and opening is one blink. A second blink within about 450ms selects the section under the ring. A single blink does nothing. A wink does nothing.

The ring is a coarse aim from the middle of the viewport. It is meant for large sections, not for hitting a small control.

## Tests

```
npm test
```

The tests cover gaze, the blink timing, and which section a point lands on. They do not open a camera.
