// 8영역 방사형 지도 (SVG 문자열 생성)
import { MIN, MAX, idealRange } from './scoring.js';

const C = { accent: '#ee7d2b', blue: '#3b6ea8', band: '#efdcc4', grid: '#d9cbb8', ink: '#2b2622', muted: '#6d655e', bg: '#ffffff' };

function pt(cx, cy, r, i) {
  const a = -Math.PI / 2 + i * (Math.PI * 2 / 8);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const rOf = (R, s) => R * (Math.max(MIN, Math.min(MAX, s)) - MIN) / (MAX - MIN) * 0.94 + R * 0.06;
const poly = pts => pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {object} o
 * @param {Array} o.areas
 * @param {Array<{scores:number[], color?:string, dashed?:boolean, bands?:string[]}>} o.series
 * @param {boolean} [o.scoreLabels] 라벨에 점수 표시 (1인 결과)
 * @param {number} [o.highlight] 강조할 영역 index (부부 비교의 가장 벌어진 영역)
 */
export function radarSVG({ areas, series, scoreLabels = false, highlight = -1, size = 360, fontFamily = 'inherit' }) {
  const W = size, H = size, cx = W / 2, cy = H / 2, R = size * 0.29;
  const n = areas.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="8영역 양육 태도 지도" font-family="${esc(fontFamily)}">`;

  // 적정 범위 띠 (영역별 구간)
  const outer = areas.map((a, i) => pt(cx, cy, rOf(R, idealRange(a)[1] + 0.5), i));
  const inner = areas.map((a, i) => pt(cx, cy, rOf(R, idealRange(a)[0] - 0.5), i));
  s += `<path d="M${poly(outer).replace(/ /g, ' L')} Z M${poly(inner.slice().reverse()).replace(/ /g, ' L')} Z" fill="${C.band}" fill-opacity=".75" fill-rule="evenodd"/>`;

  // 격자
  s += `<polygon points="${poly(areas.map((_, i) => pt(cx, cy, R, i)))}" fill="none" stroke="${C.grid}" stroke-width="1.2"/>`;
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(cx, cy, R, i);
    s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.grid}" stroke-width=".8" stroke-opacity=".7"/>`;
  }

  // 가장 벌어진 영역 표시 (점선)
  if (highlight >= 0 && series.length === 2) {
    const a = pt(cx, cy, rOf(R, series[0].scores[highlight]), highlight);
    const b = pt(cx, cy, rOf(R, series[1].scores[highlight]), highlight);
    s += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${C.ink}" stroke-width="2.2" stroke-dasharray="2 4" stroke-linecap="round"/>`;
  }

  // 시리즈
  series.forEach((sr, k) => {
    const color = sr.color || (k === 0 ? C.accent : C.blue);
    const pts = sr.scores.map((v, i) => pt(cx, cy, rOf(R, v), i));
    s += `<polygon points="${poly(pts)}" fill="${color}" fill-opacity="${series.length > 1 ? 0.06 : 0.1}" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" ${sr.dashed ? 'stroke-dasharray="7 5"' : ''}/>`;
    if (sr.bands) {
      pts.forEach(([x, y], i) => {
        const out = sr.bands[i] !== 'ideal';
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${out ? 5.2 : 4.4}" fill="${out ? color : '#fff'}" stroke="${color}" stroke-width="2.2"/>`;
      });
    } else if (highlight >= 0) {
      const [x, y] = pts[highlight];
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${color}"/>`;
    }
  });

  // 라벨
  const fs = size * 0.034;
  areas.forEach((a, i) => {
    const [x, y] = pt(cx, cy, R + size * 0.045, i);
    const side = Math.abs(x - cx) < 4 ? 0 : x > cx ? 1 : -1;
    const anchor = side === 0 ? 'middle' : side > 0 ? 'start' : 'end';
    const lines = scoreLabels && series[0] ? 2 : 1;
    // 위쪽 라벨은 위로, 아래쪽은 아래로, 옆은 가운데 정렬
    const top = y < cy - R * 0.8, bottom = y > cy + R * 0.8;
    let y0 = top ? y - (lines - 1) * fs * 1.15 - 2 : bottom ? y + fs : y - ((lines - 1) * fs * 1.15) / 2 + fs * 0.35;
    const strong = i === highlight;
    s += `<text x="${x.toFixed(1)}" y="${y0.toFixed(1)}" text-anchor="${anchor}" font-size="${fs.toFixed(1)}" font-weight="${strong ? 800 : 600}" fill="${strong ? C.ink : C.muted}">${esc(a.name)}`;
    if (lines === 2) s += `<tspan x="${x.toFixed(1)}" dy="${(fs * 1.15).toFixed(1)}" font-weight="800" fill="${C.ink}">${series[0].scores[i]}</tspan>`;
    s += '</text>';
  });
  return s + '</svg>';
}
