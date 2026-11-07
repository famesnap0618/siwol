// 채점·판정 로직 (DOM 의존 없음 — 브라우저와 node 테스트에서 함께 사용)

export const AREA_KEYS = ['affection', 'reasoning', 'achievement', 'involvement', 'discipline', 'monitoring', 'implicit', 'consistency'];
export const MIN = 10, MAX = 50;

/** 문항 응답 {q01: 1..5, ...} → 영역별 합계 배열(AREA_KEYS 순서) */
export function scoreAnswers(items, answers) {
  const sums = Object.fromEntries(AREA_KEYS.map(k => [k, 0]));
  for (const it of items) {
    const v = answers[it.id];
    if (!(v >= 1 && v <= 5)) throw new Error(`미응답 문항: ${it.id}`);
    sums[it.area] += v;
  }
  return AREA_KEYS.map(k => sums[k]);
}

/** 점수 → 'low' | 'ideal' | 'high' */
export function band(area, score) {
  if (score <= area.cut.lowMax) return 'low';
  if (score >= area.cut.highMin) return 'high';
  return 'ideal';
}

export function idealRange(area) {
  return [area.cut.lowMax + 1, area.cut.highMin - 1];
}

/** 적정 범위 경계에서 몇 점 벗어났는지 (적정이면 0) */
export function distance(area, score) {
  const [lo, hi] = idealRange(area);
  if (score < lo) return lo - score;
  if (score > hi) return score - hi;
  return 0;
}

/** 한 사람의 점수 배열 → 영역별 판정 */
export function evaluate(areas, scores) {
  const rows = areas.map((a, i) => ({
    area: a, key: a.key, index: i, score: scores[i],
    band: band(a, scores[i]), distance: distance(a, scores[i]),
  }));
  const out = rows.filter(r => r.band !== 'ideal');
  return {
    rows,
    idealCount: rows.length - out.length,
    outCount: out.length,
    highCount: out.filter(r => r.band === 'high').length,
    lowCount: out.filter(r => r.band === 'low').length,
  };
}

/**
 * 조합 카드 선택 (결과 페이지 문구 v3, 9쪽 규칙)
 * 1) 적정 밖 두 영역의 짝 중 조건이 맞는 것을 모두 찾는다 (일관성↑ 짝은 제외)
 * 2) 우선순위 단계가 낮은(1이 가장 먼저) 것 → 두 영역의 이탈 거리 합이 큰 것 → 표 번호가 작은 것
 * 반환: { top, total } | null
 */
export function pickCombo(ev, combos, { excludeConsistencyHigh = true } = {}) {
  const dir = Object.fromEntries(ev.rows.map(r => [r.key, r.band]));
  const dist = Object.fromEntries(ev.rows.map(r => [r.key, r.distance]));
  const isExcluded = (k, d) => excludeConsistencyHigh && k === 'consistency' && d === 'high';
  const hits = combos.filter(c =>
    dir[c.a] === c.aDir && dir[c.b] === c.bDir && !isExcluded(c.a, c.aDir) && !isExcluded(c.b, c.bDir));
  if (!hits.length) return null;
  hits.sort((x, y) =>
    x.priority - y.priority ||
    (dist[y.a] + dist[y.b]) - (dist[x.a] + dist[x.b]) ||
    x.id - y.id);
  return { top: hits[0], total: hits.length, soft: hits[0].priority === 4 };
}

/** 전체 모양 (A~D). 짝 카드와 별개로 '지도 전체로 보면' 보조 문구에 사용 */
export function pickShape(ev) {
  if (ev.outCount === 0) return 'A';
  if (ev.highCount >= 4) return 'B';
  if (ev.lowCount >= 4) return 'C';
  if (ev.outCount >= 5) return 'D';
  return null;
}

/** 짝도 모양도 없을 때 '먼저 볼 영역' — 가장 멀리 벗어난 영역 (동점이면 번호가 작은 쪽, 일관성↑는 후순위) */
export function pickFocus(ev) {
  const out = ev.rows.filter(r => r.band !== 'ideal');
  if (!out.length) return null;
  const weak = r => (r.area.highIsStrength && r.band === 'high') ? 1 : 0;
  return [...out].sort((x, y) => weak(x) - weak(y) || y.distance - x.distance || x.index - y.index)[0];
}

/** 결과 영역 카드 전체를 한 번에 판단 */
export function interpret(ev, combos, opts) {
  const combo = pickCombo(ev, combos, opts);
  const shape = pickShape(ev);
  const focus = (!combo && !shape) ? pickFocus(ev) : null;
  return { combo, shape, focus };
}

/**
 * 부부 비교: 밴드가 다른 영역 중 점수 차의 절댓값이 가장 큰 영역 1개 (동점이면 번호가 작은 쪽)
 * 패턴: 한쪽 높음·한쪽 적정 → A, 한쪽 낮음·한쪽 적정 → B, 한쪽 높음·한쪽 낮음 → C
 */
export function compareCouple(evA, evB) {
  const rows = evA.rows.map((a, i) => {
    const b = evB.rows[i];
    return { area: a.area, key: a.key, index: i, a: a.score, b: b.score, bandA: a.band, bandB: b.band, diff: Math.abs(a.score - b.score) };
  });
  const differing = rows.filter(r => r.bandA !== r.bandB);
  const sorted = [...rows].sort((x, y) => y.diff - x.diff || x.index - y.index);
  if (!differing.length) return { gap: null, rows: sorted };
  const gap = [...differing].sort((x, y) => y.diff - x.diff || x.index - y.index)[0];
  const set = new Set([gap.bandA, gap.bandB]);
  gap.pattern = set.has('high') && set.has('low') ? 'C' : set.has('high') ? 'A' : 'B';
  return { gap, rows: sorted };
}

// ---------- 결과 URL ----------
// result.html?r=m&d=20261021&s=24-31-40-30-38-28-37-22[&pr=f&pd=20261022&ps=...]
export const ROLES = ['m', 'f', 'o'];

export function encodePerson(p, prefix = '') {
  return `${prefix}r=${p.role}&${prefix}d=${p.date}&${prefix}s=${p.scores.join('-')}`;
}

export function decodePerson(params, prefix = '') {
  const role = params.get(prefix + 'r');
  const date = params.get(prefix + 'd');
  const s = params.get(prefix + 's');
  if (!role && !date && !s) return null;
  if (!ROLES.includes(role)) throw new Error('role');
  if (!/^\d{8}$/.test(date || '')) throw new Error('date');
  const scores = (s || '').split('-').map(Number);
  if (scores.length !== 8 || scores.some(v => !Number.isInteger(v) || v < MIN || v > MAX)) throw new Error('scores');
  return { role, date, scores };
}

export function todayStamp(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
