'use strict';
/* CMT Factory: scale the whole interface on very large screens.
   4K at 100% Windows scaling would otherwise show a tiny phone-sized layout in the corner.
   Root zoom behaves like the browser's own page zoom: text and icons are re-rendered at the
   larger size (crisp, not a blurred transform), fixed bars and 100vh still fit.
   The matching factor is published as --zoom so app.css can compensate 100vh. */
(function () {
  try {
    var w = window.innerWidth || screen.width;
    var z = w >= 3400 ? 2 : w >= 2500 ? 1.7 : w >= 2100 ? 1.35 : 1;
    /* never shrink below 1: the login card needs ~1010 CSS px of height, so a short
       window (1366x768) must keep zoom 1 instead of scaling down. */
    var cap = (window.innerHeight || screen.height) / 1010;
    if (cap < 1) cap = 1;
    if (z > cap) z = cap;
    z = Math.round(z * 100) / 100;
    document.documentElement.style.setProperty('--zoom', z);
    if (z > 1.02) document.documentElement.style.zoom = z;
  } catch (e) {}
})();
