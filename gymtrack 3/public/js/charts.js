import { h, fmtDate, fmtNum } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Gráfica de línea minimalista. data: [{date:'YYYY-MM-DD', value:number}]
export function lineChart(data, { unit = '', height = 220, decimals = 1 } = {}) {
  const box = h('div', { class: 'chart' });
  if (!data || data.length === 0) return h('div', { class: 'chart-empty' }, 'Aún no hay mediciones para mostrar.');
  const W = 640, H = height, pl = 44, pr = 16, pt = 16, pb = 30;
  const vals = data.map((d) => d.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.18; min -= pad; max += pad;
  const t = (d) => new Date(d + 'T12:00:00').getTime();
  const t0 = t(data[0].date), t1 = t(data[data.length - 1].date);
  const x = (i, d) => (data.length === 1 ? pl + (W - pl - pr) / 2 : pl + ((t(d) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr));
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Gráfica de ${data.length} mediciones` });
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3, yy = y(v);
    svg.append(s('line', { class: 'grid-line', x1: pl, x2: W - pr, y1: yy, y2: yy }));
    const tx = s('text', { class: 'axis', x: pl - 10, y: yy + 4, 'text-anchor': 'end' });
    tx.textContent = fmtNum(v, decimals > 0 && max - min < 6 ? 1 : 0);
    svg.append(tx);
  }
  const labelIdx = data.length <= 4 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  for (const i of new Set(labelIdx)) {
    const tx = s('text', { class: 'axis', x: x(i, data[i].date), y: H - 8, 'text-anchor': i === 0 && data.length > 1 ? 'start' : i === data.length - 1 && data.length > 1 ? 'end' : 'middle' });
    tx.textContent = fmtDate(data[i].date, false);
    svg.append(tx);
  }
  const pts = data.map((d, i) => [x(i, d.date), y(d.value)]);
  if (data.length > 1) {
    const dPath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    svg.append(s('path', { class: 'area', d: `${dPath} L${pts[pts.length - 1][0]},${H - pb} L${pts[0][0]},${H - pb} Z` }));
    svg.append(s('path', { class: 'line', d: dPath }));
  }
  const tip = h('div', { class: 'chart-tip' });
  data.forEach((d, i) => {
    const [cx, cy] = pts[i];
    const c = s('circle', { class: `pt ${i === data.length - 1 ? 'last' : ''}`, cx, cy, r: 4 });
    svg.append(c);
    const hit = s('circle', { class: 'hit', cx, cy, r: 16 });
    const show = () => {
      tip.textContent = `${fmtNum(d.value, 2)}${unit} · ${fmtDate(d.date)}`;
      tip.style.left = `${(cx / W) * 100}%`;
      tip.style.top = `${(cy / H) * 100}%`;
      tip.style.opacity = '1';
      c.setAttribute('r', 6);
    };
    const hide = () => { tip.style.opacity = '0'; c.setAttribute('r', 4); };
    hit.addEventListener('mouseenter', show); hit.addEventListener('mouseleave', hide);
    hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
    hit.addEventListener('touchstart', show, { passive: true });
    svg.append(hit);
  });
  box.append(svg, tip);
  return box;
}

// Anillo de progreso (0-100)
export function ring(pct, size = 132) {
  const r = 54, c = 2 * Math.PI * r;
  const wrap = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } });
  const svg = s('svg', { viewBox: '0 0 128 128' });
  svg.append(s('circle', { cx: 64, cy: 64, r, fill: 'none', stroke: '#E5E7EB', 'stroke-width': 8 }));
  const arc = s('circle', { cx: 64, cy: 64, r, fill: 'none', stroke: '#B69A6A', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c });
  arc.style.transition = 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)';
  svg.append(arc);
  wrap.append(svg, h('div', { class: 'num' }, `${Math.round(pct)}%`));
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(100, pct)) / 100))));
  return wrap;
}

export const progressBar = (pct, gold = false) => h('div', { class: `bar ${gold ? 'gold' : ''}`, role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%` } }));
