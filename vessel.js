(() => {
  'use strict';
  const canvas = document.getElementById('vessel-art');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function paint() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);

    const deck = height - 45;
    const stern = 12;
    const bow = width - 12;
    const beam = bow - stern;
    const depth = Math.min(35, Math.max(29, beam * .075));
    const cabin = width / 2;

    function shape(path, color) {
      const outline = new Path2D(path);
      ctx.fillStyle = color;
      ctx.fill(outline);
      return outline;
    }

    function line(path, color, weight) {
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(path));
    }

    function circle(x, y, radius, color) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const waterline = deck + depth;
    const shadow = ctx.createRadialGradient(cabin, waterline + 3, 2, cabin, waterline + 3, beam * .51);
    shadow.addColorStop(0, '#173d4860');
    shadow.addColorStop(1, '#173d4800');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cabin, waterline + 6, beam * .51, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const deckSurface = shape(
      'M ' + (stern + 22) + ' ' + (deck - 12) +
      ' L ' + (bow - 28) + ' ' + (deck - 12) +
      ' Q ' + (bow - 19) + ' ' + (deck - 12) + ' ' + bow + ' ' + (deck - 3) +
      ' L ' + (bow - 15) + ' ' + (deck + 2) +
      ' L ' + (stern + 13) + ' ' + (deck + 2) +
      ' L ' + stern + ' ' + (deck - 1) + ' Z', '#ba925f'
    );
    ctx.save();
    ctx.clip(deckSurface);
    for (let y = deck - 10; y < deck + 3; y += 4) {
      line('M ' + stern + ' ' + y + ' H ' + bow, '#88614182', 1);
    }
    ctx.restore();

    const gradient = ctx.createLinearGradient(0, deck, 0, waterline);
    gradient.addColorStop(0, '#416e73');
    gradient.addColorStop(.34, '#2c5761');
    gradient.addColorStop(1, '#193f4a');
    const hull = shape(
      'M ' + stern + ' ' + (deck - 1) +
      ' Q ' + (stern + 15) + ' ' + (deck + 3) + ' ' + (stern + 41) + ' ' + (deck + 3) +
      ' L ' + (bow - 40) + ' ' + (deck + 3) +
      ' Q ' + (bow - 13) + ' ' + (deck + 2) + ' ' + bow + ' ' + (deck - 6) +
      ' C ' + (bow - 9) + ' ' + (deck + depth * .22) + ' ' + (bow - 23) + ' ' + (waterline - 6) +
      ' ' + (bow - 49) + ' ' + (waterline - 2) +
      ' Q ' + (bow - 64) + ' ' + waterline + ' ' + (bow - 88) + ' ' + waterline +
      ' H ' + (stern + 61) +
      ' Q ' + (stern + 14) + ' ' + waterline + ' ' + stern + ' ' + (deck - 1) + ' Z', gradient
    );
    ctx.save();
    ctx.clip(hull);
    line('M ' + stern + ' ' + (deck + 6) + ' Q ' + cabin + ' ' + (deck + 11) + ' ' + bow + ' ' + (deck + 2), '#d47c60', 7);
    line('M ' + (stern + 11) + ' ' + (waterline - 5) + ' H ' + (bow - 35), '#163d49', 2);
    const portholes = Math.max(4, Math.round(beam / 70));
    for (let i = 0; i < portholes; i++) {
      const x = stern + 36 + (beam - 82) * ((i + .5) / portholes);
      circle(x, deck + depth * .65, 3.2, '#204550');
      circle(x, deck + depth * .65 - 1, 2.1, '#91aea5');
    }
    ctx.restore();
    line('M ' + stern + ' ' + (deck - 1) + ' Q ' + (stern + 17) + ' ' + (deck + 4) +
      ' ' + (stern + 43) + ' ' + (deck + 3) + ' H ' + (bow - 41) + ' Q ' +
      (bow - 13) + ' ' + (deck + 2) + ' ' + bow + ' ' + (deck - 6), '#f0ca8f', 3);
    line('M ' + (stern + 4) + ' ' + (deck - 2) + ' L ' + (stern + 23) + ' ' + (deck - 14) +
      ' H ' + (bow - 28), '#ddba8a', 2);

    const cabinWidth = Math.min(40, Math.max(23, beam * .089));
    const left = cabin - cabinWidth * .55;
    const top = deck - 46;
    const side = 6;
    shape('M ' + (left + cabinWidth) + ' ' + top + ' l ' + side + ' -5 v 42 l -' + side + ' 5 Z', '#b59368');
    const ivory = ctx.createLinearGradient(left, top, left + cabinWidth, top);
    ivory.addColorStop(0, '#f7e7b8');
    ivory.addColorStop(1, '#ecd39d');
    ctx.fillStyle = ivory;
    ctx.fillRect(left, top, cabinWidth, 45);
    shape('M ' + (left - 3) + ' ' + (top - 2) + ' l 8 -5 h ' + (cabinWidth + 4) +
      ' l -8 5 Z', '#de9673');
    shape('M ' + (left - 3) + ' ' + (top - 2) + ' h ' + (cabinWidth + 4) + ' v 5 h -' +
      (cabinWidth + 4) + ' Z', '#a75241');
    ctx.fillStyle = '#385e62';
    const pane = (cabinWidth - 12) / 2;
    ctx.fillRect(left + 4, top + 9, pane, 11);
    ctx.fillRect(left + 8 + pane, top + 9, pane, 11);
    line('M ' + (left + 5) + ' ' + (top + 10) + ' h ' + (pane - 2), '#9eb2a7', 1);
    line('M ' + (left + 8 + pane) + ' ' + (top + 10) + ' h ' + (pane - 2), '#9eb2a7', 1);
    line('M ' + cabin + ' ' + (top - 6) + ' v -15', '#725944', 1.5);
    shape('M ' + cabin + ' ' + (top - 21) + ' l 18 4 -18 5 Z', '#d67255');

    line('M ' + (stern + 3) + ' ' + (waterline + 5) + ' q 17 3 27 0', '#d4e1c48c', 1);
    line('M ' + (bow - 22) + ' ' + (waterline - 4) + ' q 13 -2 19 -6', '#d4e1c494', 1);
  }

  new ResizeObserver(paint).observe(canvas);
  paint();
})();
