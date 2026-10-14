/* =============================================
   NOTEBOOK ROBOT
   A small doodled robot drives over the page and writes words
   into .robot-slot elements. The pencil line is the robot's own
   trail: it records where the robot actually drove, not the
   ideal letter shape, so wobble and corrections show up in it.

   Order: writes "hi!" on landing, circles the hero margin note
   in red, then drives ahead of the reader and waits beside each
   section's slot, writing the word once the section is in view.
   ============================================= */
(function () {
  "use strict";

  var G = window.NotebookGlyphs;
  var NS = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia("(max-width: 860px)");

  var CFG = {
    drawSpeed: 300,     // px/s with the pen down
    travelSpeed: 480,   // px/s with the pen up (long trips go faster, see driveTo)
    maxTravel: 1500,    // px/s cap for long trips down the page
    turnRate: 20,       // max rad/s
    lookahead: 6,       // px, how far ahead on the path it steers toward
    sample: 3,          // px between path waypoints
    wobble: 0.07,       // rad of heading wander
    pad: 14,            // px inside each slot
    heroScale: 20,      // max px per letter unit in the hero
    lineScale: 9,       // max px per letter unit in section slots
    dryMs: 7000,        // how long an old word takes to dry
    dryOpacity: 0.3     // how faint it ends up
  };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function val(p) { return typeof p === "function" ? p() : p; }

  // ---------- overlay ----------
  var svg = el("svg", { "class": "robot-layer", "aria-hidden": "true", focusable: "false" });
  var defs = el("defs", {}, svg);
  var f = el("filter", { id: "pencil", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", seed: "3", result: "grain" }, f);
  el("feDisplacementMap", { "in": "SourceGraphic", in2: "grain", scale: "1.8", xChannelSelector: "R", yChannelSelector: "G" }, f);
  var trails = el("g", { "class": "trails" }, svg);

  // top-down doodle: front of the robot faces +x
  var bot = el("g", { "class": "bot", filter: "url(#pencil)" }, svg);
  bot.innerHTML =
    '<g stroke="#3a3c41" stroke-linecap="round" stroke-linejoin="round" fill="#fbf9f3">' +
      // wheels
      '<path stroke-width="1.6" d="M-11 -21.5C-5 -22.8 5 -22.2 10.5 -21.2C12 -20.6 11.6 -17 10.4 -16.6C4 -15.8-5 -16-11.2 -16.8C-12.6 -17.4-12.5 -20.9-11 -21.5Z"/>' +
      '<path stroke-width="1.6" d="M-11.4 21.2C-5 22.6 5 22.4 10.2 21.4C11.8 20.8 11.7 17.2 10.6 16.7C4 15.9-5 15.8-11 16.6C-12.4 17.2-12.7 20.6-11.4 21.2Z"/>' +
      '<path stroke-width="0.9" fill="none" d="M-7 -21.6L-6 -16.4M-2 -22L-1.4 -16.2M3 -22L3.4 -16.1M7.4 -21.6L7.8 -16.3M-7.4 21.2L-6.6 16.3M-2.6 21.8L-2 16.1M2.6 21.9L3 16M7 21.6L7.6 16.4"/>' +
      // body, plus a second sloppier pass so it reads as sketched
      '<path stroke-width="1.7" d="M-15.4 -10.5C-15.6 -15.4-12.2 -16.6-6 -16.4L8.2 -16C14.4 -15.6 17.4 -11.6 17.2 -5.6L17.4 5.2C17.2 12 13.8 16.2 7.6 16.3L-7.2 16.1C-13.2 15.9-15.8 12.8-15.4 7.6Z"/>' +
      '<path stroke-width="0.8" fill="none" opacity="0.55" d="M-14.6 -11.4C-14.2 -15.8-10 -15.9-4 -16.9M9.6 -15.4C15.6 -14.2 16.4 -10 16.6 -3.4M16.8 7.4C15.8 13.6 12.6 15.4 5.4 16.9M-9 16.8C-14.4 15.4-16.4 11.2-14.8 4.6"/>' +
      // sensor eyes
      '<circle stroke-width="1.5" cx="10" cy="-6.2" r="3.4"/><circle stroke-width="1.5" cx="10.2" cy="6" r="3.4"/>' +
      '<circle fill="#3a3c41" stroke="none" cx="11.2" cy="-6" r="1.3"/><circle fill="#3a3c41" stroke="none" cx="11.4" cy="6.2" r="1.3"/>' +
      // little smile and the pencil in the middle
      '<path stroke-width="1.1" fill="none" d="M14.2 -2.4C15.4 -0.8 15.4 0.9 14.2 2.4"/>' +
      '<circle stroke-width="1.2" cx="-2" cy="0" r="3.2"/><path stroke-width="0.8" fill="none" d="M-4 -1.6L-0.4 1.8M-4.6 0.6L-2.6 2.6M-3.2 -2.8L-0.2 -0.2"/>' +
    '</g>';

  // ---------- geometry ----------
  function bodyOffset(node) {
    var r = node.getBoundingClientRect(), b = document.body.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  }

  // resample a polyline so waypoints are evenly spaced
  function resample(pts, step) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = out[out.length - 1], b = pts[i];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (d >= step) {
        var t = step / d;
        a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        out.push(a);
        d -= step;
      }
    }
    var last = pts[pts.length - 1], tail = out[out.length - 1];
    if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.5) out.push(last);
    return out;
  }

  // vertical slice of the page the reader can currently see (page coords)
  function inView(y0, y1) {
    var top = -document.body.getBoundingClientRect().top;
    return y1 > top - 60 && y0 < top + window.innerHeight + 60;
  }
  function robotInView() { return inView(R.y - 40, R.y + 40); }
  function inkInView(ink) { return inView(ink.oy, ink.oy + ink.box.h); }

  // x of the travel lane: just left of the red margin line
  function laneX() {
    return Math.max(18, bodyOffset(document.querySelector(".column")).x - 52);
  }

  // ---------- ink: pen strokes pinned to a page element ----------
  // Strokes are stored relative to the anchor's top-left corner, so the
  // ink follows its element if the layout shifts.
  function Ink(anchor, build, cls) {
    this.anchor = anchor;
    this.section = anchor.closest("section");
    this.g = el("g", { "class": "ink" + (cls ? " " + cls : ""), filter: "url(#pencil)" }, trails);
    this.place();
    this.strokes = build(this.box).map(function (st) { return resample(st, CFG.sample); });
    this.done = false;
  }
  Ink.prototype.place = function () {
    var b = this.box = bodyOffset(this.anchor);
    this.ox = b.x; this.oy = b.y;
    this.g.setAttribute("transform", "translate(" + b.x + " " + b.y + ")");
  };
  Ink.prototype.at = function (p) { return [p[0] + this.ox, p[1] + this.oy]; };
  Ink.prototype.newLine = function () { return el("path", { "class": "trail", d: "" }, this.g); };
  // reduced motion: just ink the ideal shape
  Ink.prototype.drawStatic = function () {
    var self = this;
    this.strokes.forEach(function (st) {
      self.newLine().setAttribute("d", "M" + st.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L"));
    });
    this.done = true;
  };
  Ink.prototype.dry = function () {
    if (this.dried) return;
    this.dried = true;
    this.g.style.transition = "opacity " + CFG.dryMs + "ms ease-in";
    this.g.style.opacity = String(CFG.dryOpacity);
  };

  function wordInk(slot) {
    var text = slot.getAttribute("data-word");
    var inHero = !!slot.closest(".hero");
    var ink = new Ink(slot, function (box) {
      var w = G.word(text), s, ox, oy;
      if (inHero) {
        // big and centred in the hero slot
        s = Math.min((box.w - 2 * CFG.pad) / w.box.w, (box.h - 2 * CFG.pad) / w.box.h, CFG.heroScale);
        ox = (box.w - w.box.w * s) / 2 - w.box.x * s;
        oy = (box.h - w.box.h * s) / 2 - w.box.y * s;
      } else {
        // section words share one baseline and size, left-aligned with the text
        s = Math.min((box.h - 2 * CFG.pad) / 13, CFG.lineScale);
        ox = 2 - w.box.x * s;
        oy = CFG.pad + 9 * s;
      }
      return w.strokes.map(function (st) {
        return st.map(function (p) { return [ox + p[0] * s, oy + p[1] * s]; });
      });
    });
    ink.text = text;
    ink.hero = inHero;
    ink.slot = slot;
    return ink;
  }

  // a loose red loop around an element, going round a bit more than once
  function circleInk(target) {
    return new Ink(target, function (box) {
      var cx = box.w / 2, cy = box.h / 2, rx = box.w / 2 + 16, ry = box.h / 2 + 12;
      var a0 = narrow.matches ? 200 : -20, pts = [];
      for (var a = a0; a >= a0 - 415; a -= 8) {
        var r = 1 + 0.05 * Math.sin(a * 0.04), t = a * Math.PI / 180;
        pts.push([cx + rx * r * Math.cos(t), cy + ry * r * Math.sin(t)]);
      }
      return [pts];
    }, "red");
  }

  // ---------- robot ----------
  var R = {
    x: 0, y: 0, th: Math.PI,
    t: 0, kick: 0, nextKick: 1,
    ph: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
    size: 1,
    at: null,          // the ink the robot is currently next to
    offstage: true
  };

  function setSize() { R.size = window.innerWidth < 600 ? 0.95 : 1.3; }
  function drawBot() {
    bot.setAttribute("transform", "translate(" + R.x.toFixed(1) + " " + R.y.toFixed(1) + ") rotate(" + (R.th * 180 / Math.PI).toFixed(1) + ") scale(" + R.size + ")");
  }

  // Steer toward (tx, ty) for one frame. Returns distance left.
  function steer(tx, ty, vmax, dt, slowNear) {
    var dx = tx - R.x, dy = ty - R.y, dist = Math.hypot(dx, dy);
    // heading wander: two slow sines plus the occasional bump it has to correct
    var wander = CFG.wobble * (0.6 * Math.sin(R.t * 5.3 + R.ph[0]) + 0.4 * Math.sin(R.t * 11.7 + R.ph[1]));
    var want = Math.atan2(dy, dx) + wander + R.kick;
    var err = wrap(want - R.th);
    // close most of the heading error each frame, never more than all of it
    R.th = wrap(R.th + clamp(err * Math.min(1, 40 * dt), -CFG.turnRate * dt, CFG.turnRate * dt));
    // big heading error: pivot on the spot like a differential drive
    var v = Math.abs(err) > 0.6 ? 0 : vmax * (1 - Math.abs(err) / 1.4);
    v *= 0.88 + 0.12 * Math.sin(R.t * 3.1 + R.ph[2]);
    if (slowNear) v = Math.min(v, dist * 9 + 50);
    var stepLen = Math.min(v * dt, dist);
    R.x += Math.cos(R.th) * stepLen;
    R.y += Math.sin(R.th) * stepLen;
    return Math.hypot(tx - R.x, ty - R.y);
  }

  function tickNoise(dt) {
    R.t += dt;
    R.kick *= Math.pow(0.02, dt);       // bumps die out within a second
    R.nextKick -= dt;
    if (R.nextKick <= 0) {
      R.kick += (Math.random() - 0.5) * 0.35;
      R.nextKick = 0.7 + Math.random() * 1.1;
    }
  }

  // run fn(dt) every frame until it returns true; nothing runs while idle
  function loop(fn) {
    return new Promise(function (resolve) {
      var last = performance.now();
      function frame(now) {
        var dt = Math.min(0.04, (now - last) / 1000);
        last = now;
        tickNoise(dt);
        var done = fn(dt);
        drawBot();
        if (done) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // pen up, drive to a point (page coords, or a function returning one).
  // Long trips get a faster top speed so the robot stays ahead of the reader.
  function driveTo(target, passThrough) {
    var p0 = val(target);
    if (!robotInView() && !inView(p0[1] - 40, p0[1] + 40)) {
      R.x = p0[0]; R.y = p0[1];
      drawBot();
      return Promise.resolve();
    }
    var v = clamp(Math.hypot(p0[0] - R.x, p0[1] - R.y) * 1.1, CFG.travelSpeed, CFG.maxTravel);
    return loop(function (dt) {
      var p = val(target);
      return steer(p[0], p[1], v, dt, !passThrough) < (passThrough ? 14 : 2);
    });
  }
  // drive through waypoints, braking only at the last one
  function route(points) {
    return points.reduce(function (chain, p, i) {
      return chain.then(function () { return driveTo(p, i < points.length - 1); });
    }, Promise.resolve());
  }
  function face(angle) {
    return loop(function (dt) {
      var err = wrap(angle - R.th);
      R.th += clamp(err * 6, -3, 3) * dt;
      return Math.abs(err) < 0.02;
    });
  }

  // pen down along one stroke, inking where the robot actually goes
  function drawStroke(ink, pts) {
    var i = 0, line = ink.newLine(), d = "", lx = null, ly = null;
    // the reader scrolled away: finish the stroke as-is and move on
    function rush() {
      d += pts.slice(i).map(function (p) { return " L" + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
      line.setAttribute("d", d);
      var end = ink.at(pts[pts.length - 1]);
      R.x = end[0]; R.y = end[1];
      return true;
    }
    function mark() {
      var x = R.x - ink.ox, y = R.y - ink.oy;
      if (lx === null || Math.hypot(x - lx, y - ly) > 1) {
        d += (d ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
        line.setAttribute("d", d);
        lx = x; ly = y;
      }
    }
    mark();
    return loop(function (dt) {
      if (!inkInView(ink) && !robotInView()) return rush();
      while (i < pts.length - 1) {
        var p = ink.at(pts[i]);
        if (Math.hypot(p[0] - R.x, p[1] - R.y) >= CFG.lookahead) break;
        i++;
      }
      var tgt = ink.at(pts[i]);
      var left = steer(tgt[0], tgt[1], CFG.drawSpeed, dt, i === pts.length - 1);
      mark();
      return i === pts.length - 1 && left < 1.5;
    });
  }

  function draw(ink) {
    R.at = ink;
    return ink.strokes.reduce(function (chain, st) {
      return chain
        .then(function () { return driveTo(function () { return ink.at(st[0]); }); })
        .then(function () { return drawStroke(ink, st); });
    }, Promise.resolve()).then(function () { ink.done = true; });
  }

  // resting spot just right of a word's last stroke, kept inside its slot
  function parkSpot(ink) {
    var last = ink.strokes[ink.strokes.length - 1], end = last[last.length - 1];
    return function () { return ink.at([Math.min(end[0] + 40, ink.box.w - 10), end[1] + 6]); };
  }
  // waiting spot: in the margin, level with where the word starts
  function waitSpot(ink) {
    return function () {
      var s = ink.at(ink.strokes[0][0]);
      return [Math.max(20, ink.ox - 34), s[1]];
    };
  }

  // Get to a word's waiting spot without driving over text: drop into the
  // empty gap at the bottom of the current section, slide over to the lane
  // left of the margin line, run down (or up) the lane, then pull in.
  function goTo(ink) {
    if (R.offstage) {
      R.offstage = false;
      var s = ink.at(ink.strokes[0][0]);
      R.x = document.body.clientWidth + 40; R.y = s[1]; R.th = Math.PI;
      drawBot();
      return Promise.resolve();
    }
    var from = R.at, sx = R.x;
    var exitY = function () { var b = bodyOffset(from.section); return b.y + b.h - 18; };
    var wait = waitSpot(ink);
    if (!robotInView()) {
      var w = wait();
      R.at = ink;
      if (!inView(w[1] - 40, w[1] + 40)) {
        // neither end is on screen: just be there already
        R.x = w[0]; R.y = w[1]; R.th = 0;
        drawBot();
        return Promise.resolve();
      }
      // pop in from just past the screen edge, in the lane
      var top = -document.body.getBoundingClientRect().top;
      R.x = laneX();
      R.y = R.y < w[1] ? top - 70 : top + window.innerHeight + 70;
      R.th = R.y < w[1] ? Math.PI / 2 : -Math.PI / 2;
      return route([function () { return [laneX(), wait()[1]]; }, wait]).then(function () { return face(0); });
    }
    return route([
      function () { return [sx, exitY()]; },
      function () { return [laneX(), exitY()]; },
      function () { return [laneX(), wait()[1]]; },
      wait
    ]).then(function () { R.at = ink; return face(0); });
  }

  // after "hi!": circle the hero margin note in red
  function circleNote(heroInk, circle) {
    var heroTop = function () { return bodyOffset(heroInk.section).y + 40; };
    var start = function () { return circle.at(circle.strokes[0][0]); };
    var path = narrow.matches
      // one column: run up the lane on the left, then in to the note
      ? [function () { return [laneX(), R.y]; }, function () { return [laneX(), start()[1]]; }]
      // two columns: go up into the empty strip above the hero text, then across
      : [function () { return [R.x, heroTop()]; }, function () { return [start()[0], heroTop()]; }];
    return route(path)
      .then(function () { return draw(circle); })
      .then(function () { R.at = heroInk; });
  }

  // ---------- start ----------
  function start() {
    var slots = [].slice.call(document.querySelectorAll(".robot-slot[data-word]"));
    if (!slots.length) return;
    document.body.appendChild(svg);
    setSize();

    var words = slots.map(wordInk);
    var hero = words.filter(function (w) { return w.hero; })[0];
    var note = document.querySelector(".hero .margin-note");
    var circle = note ? circleInk(note) : null;
    var all = circle ? words.concat([circle]) : words;

    // keep ink and robot pinned to their elements if the layout shifts
    new ResizeObserver(function () {
      var ox = R.at ? R.at.ox : 0, oy = R.at ? R.at.oy : 0;
      all.forEach(function (ink) { ink.place(); });
      if (R.at) { R.x += R.at.ox - ox; R.y += R.at.oy - oy; }
      setSize();
      drawBot();
    }).observe(document.body);

    if (reduced) {
      all.forEach(function (ink) { ink.drawStatic(); });
      var target = hero || words[0], p = parkSpot(target)();
      R.x = p[0]; R.y = p[1]; R.th = -0.3;
      drawBot();
      return;
    }

    // near: within a screen below the viewport -> go there and wait
    // visible: on screen, above the bottom 15% -> write it
    function watch(flag, margin) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          words[slots.indexOf(e.target)][flag] = e.isIntersecting;
        });
        schedule();
      }, { rootMargin: margin });
      slots.forEach(function (s) { io.observe(s); });
    }
    watch("near", "0px 0px 100% 0px");
    watch("visible", "0px 0px -15% 0px");

    var busy = false, waitingAt = null;
    function schedule() {
      if (busy) return;
      var todo = words.filter(function (w) { return !w.done; });
      // the hero word is written on landing as long as the reader is near the top
      if (hero && !hero.done && window.scrollY < bodyOffset(hero.section).h) hero.visible = true;
      var next = todo.filter(function (w) { return w.visible; })[0];
      if (next) {
        busy = true;
        words.forEach(function (w) { if (w.done && w !== next) w.dry(); });
        var job = (waitingAt === next ? Promise.resolve() : goTo(next))
          .then(function () { return draw(next); })
          .then(function () { return next.hero && circle ? circleNote(next, circle) : driveTo(parkSpot(next)); })
          .then(function () { return face(-0.3); });
        waitingAt = null;
        job.then(function () { busy = false; schedule(); });
        return;
      }
      next = todo.filter(function (w) { return w.near; })[0];
      if (next && waitingAt !== next) {
        busy = true;
        goTo(next).then(function () { waitingAt = next; busy = false; schedule(); });
      }
    }
    schedule();
  }

  function ready() {
    var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(function () { setTimeout(start, 350); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
