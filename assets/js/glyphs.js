/* =============================================
   SINGLE-STROKE LETTERS (Hershey-style)
   Units: baseline y = 0, x-height y = -5, ascender y = -9,
   descender y = +4. Each letter is a list of strokes; each
   stroke is one continuous pen-down line. Extra strokes are
   only used where a pen has to lift (i/j/! dots, t crossbar).
   To add a letter: add it to LETTERS with its advance width.
   ============================================= */
(function () {
  "use strict";

  // points along an elliptical arc; angles in degrees, 0 = right, 90 = down
  function arc(cx, cy, rx, ry, a0, a1) {
    var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 10));
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }
  function dot(cx, cy) { return arc(cx, cy, 0.2, 0.2, 90, -270); }
  function join() { return [].concat.apply([], arguments); }

  // Catmull-Rom through hand-placed points, for letters with no simple arc (s)
  function smooth(p) {
    var out = [];
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      for (var k = 0; k < 6; k++) {
        var t = k / 6, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(function (j) {
          return 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        }));
      }
    }
    out.push(p[p.length - 1]);
    return out;
  }

  var LETTERS = {
    a: { w: 5, s: [join(arc(2.5, -2.5, 2.5, 2.5, -15, -345), [[5, -5], [5, 0]])] },
    b: { w: 5, s: [join([[0, -9], [0, 0]], arc(2.5, -2.5, 2.5, 2.5, 135, -180))] },
    c: { w: 5, s: [arc(2.5, -2.5, 2.5, 2.5, -40, -320)] },
    e: { w: 5, s: [join([[0, -2.5], [5, -2.5]], arc(2.5, -2.5, 2.5, 2.5, 0, -320))] },
    h: { w: 5, s: [join([[0, -9], [0, 0], [0, -2.8]], arc(2.5, -2.8, 2.5, 2.2, 180, 360), [[5, 0]])] },
    i: { w: 0, s: [[[0, -5], [0, 0]], dot(0, -7.4)] },
    j: { w: 1.2, s: [join([[1.2, -5]], arc(0, 2.5, 1.2, 1.5, 0, 150)), dot(1.2, -7.4)] },
    n: { w: 5, s: [join([[0, -5], [0, 0], [0, -2.8]], arc(2.5, -2.8, 2.5, 2.2, 180, 360), [[5, 0]])] },
    o: { w: 5, s: [arc(2.5, -2.5, 2.5, 2.5, -90, -450)] },
    p: { w: 5, s: [join([[0, 4], [0, -5]], arc(2.5, -2.5, 2.5, 2.5, -135, 180))] },
    r: { w: 3.4, s: [join([[0, -5], [0, 0], [0, -2.8]], arc(2.2, -2.8, 2.2, 2.2, 180, 300))] },
    s: { w: 4.6, s: [smooth([[4.4, -4.2], [3.3, -5], [1.3, -5], [0.3, -4.2], [0.6, -3.1], [2.3, -2.6], [4.0, -2.1], [4.6, -1.1], [3.8, -0.1], [1.5, 0], [0.1, -0.8]])] },
    t: { w: 3.4, s: [join([[1.2, -8], [1.2, -1.2]], arc(2.6, -1.2, 1.4, 1.2, 180, 80)), [[0, -5], [3.2, -5]]] },
    u: { w: 5, s: [join([[0, -5], [0, -2.2]], arc(2.5, -2.2, 2.5, 2.2, 180, 0), [[5, -5], [5, 0]])] },
    "!": { w: 0, s: [[[0, -9], [0, -2.6]], dot(0, -0.4)] }
  };
  var GAP = 1.6;

  // Lay out a word: returns { strokes, box } in letter units.
  function word(text) {
    var x = 0, strokes = [];
    for (var i = 0; i < text.length; i++) {
      var L = LETTERS[text[i]];
      if (!L) { x += 3; continue; }
      L.s.forEach(function (st) {
        strokes.push(st.map(function (p) { return [p[0] + x, p[1]]; }));
      });
      x += L.w + GAP;
    }
    var xs = [], ys = [];
    strokes.forEach(function (st) { st.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    var box = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) };
    box.w = Math.max.apply(null, xs) - box.x;
    box.h = Math.max.apply(null, ys) - box.y;
    return { strokes: strokes, box: box };
  }

  window.NotebookGlyphs = { word: word };
})();
