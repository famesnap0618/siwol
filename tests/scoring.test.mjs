// 실행: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// scoring.js 는 브라우저 전역(SiwolScoring)으로 노출되는 일반 스크립트
vm.runInThisContext(readFileSync(new URL('../assets/js/scoring.js', import.meta.url), 'utf8'));
const {
  AREA_KEYS, scoreAnswers, band, distance, evaluate, pickCombo, pickShape, pickFocus,
  compareCouple, encodePerson, decodePerson,
} = globalThis.SiwolScoring;

const load = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const { areas } = load('areas.json');
const { items } = load('items.json');
const { combos } = load('combos.json');
const { patterns } = load('couple.json');

// 목업(결과 페이지 ver3)의 예시 점수
const MOM = [24, 31, 40, 30, 38, 28, 37, 22];
const DAD = [38, 26, 36, 38, 30, 35, 30, 30];

test('데이터 개수', () => {
  assert.equal(items.length, 80);
  assert.equal(combos.length, 112);
  assert.equal(patterns.length, 24);
  assert.deepEqual(areas.map(a => a.key), AREA_KEYS);
  for (const k of AREA_KEYS) assert.equal(items.filter(i => i.area === k).length, 10);
});

test('조합표는 8영역 28쌍 × 4방향을 빠짐없이 덮는다', () => {
  const seen = new Set(combos.map(c => `${c.a}${c.aDir}${c.b}${c.bDir}`));
  assert.equal(seen.size, 112);
});

test('컷오프 경계', () => {
  const ach = areas[2]; // 성과 지향 23 / 24–37 / 38
  assert.equal(band(ach, 23), 'low');
  assert.equal(band(ach, 24), 'ideal');
  assert.equal(band(ach, 37), 'ideal');
  assert.equal(band(ach, 38), 'high');
  assert.equal(distance(areas[0], 24), 3); // 애정 24 → 27에서 3점 아래 (목업과 동일)
  assert.equal(distance(ach, 40), 3);      // 성과 40 → 37에서 3점 위 (목업과 동일)
});

test('문항 합산', () => {
  const ans = Object.fromEntries(items.map(i => [i.id, 3]));
  assert.deepEqual(scoreAnswers(items, ans), Array(8).fill(30));
  delete ans.q05;
  assert.throws(() => scoreAnswers(items, ans));
});

test('목업 예시: 적정 3개, 조합 10개, 모양 D', () => {
  const ev = evaluate(areas, MOM);
  assert.equal(ev.idealCount, 3);
  const c = pickCombo(ev, combos);
  assert.equal(c.total, 10);
  assert.equal(c.top.priority, 1);
  assert.equal(c.top.id, 7); // 애정↓ 성과↑ (1단계, 이탈 거리 동점 → 번호 작은 쪽)
  assert.equal(pickShape(ev), 'D');
});

test('일관성↑ 짝은 제외', () => {
  // 일관성만 높고 애정 낮음 → 짝 없음
  const s = [20, 30, 30, 30, 30, 30, 30, 45];
  const ev = evaluate(areas, s);
  assert.equal(pickCombo(ev, combos), null);
  assert.equal(pickFocus(ev).key, 'affection');
});

test('모두 적정이면 모양 A', () => {
  const ev = evaluate(areas, [30, 30, 30, 30, 30, 30, 30, 30]);
  assert.equal(ev.idealCount, 8);
  assert.equal(pickShape(ev), 'A');
});

test('부부 비교: 목업 예시 → 애정 표현 차이 14, 패턴 C', () => {
  const { gap, rows } = compareCouple(evaluate(areas, MOM), evaluate(areas, DAD));
  assert.equal(gap.key, 'affection');
  assert.equal(gap.diff, 14);
  assert.equal(gap.pattern, 'C');
  assert.equal(rows[0].key, 'affection');
});

test('부부 밴드가 모두 같으면 차이 카드 없음', () => {
  const { gap } = compareCouple(evaluate(areas, [30, 30, 30, 30, 30, 30, 30, 30]), evaluate(areas, [33, 28, 30, 30, 30, 30, 30, 30]));
  assert.equal(gap, null);
});

test('결과 URL 왕복', () => {
  const p = { role: 'm', date: '20261021', scores: MOM };
  const q = new URLSearchParams(encodePerson(p) + '&' + encodePerson({ ...p, role: 'f', scores: DAD }, 'p'));
  assert.deepEqual(decodePerson(q), p);
  assert.deepEqual(decodePerson(q, 'p').scores, DAD);
  assert.throws(() => decodePerson(new URLSearchParams('r=m&d=20261021&s=1-2-3')));
  assert.throws(() => decodePerson(new URLSearchParams('r=x&d=20261021&s=' + MOM.join('-'))));
  assert.equal(decodePerson(new URLSearchParams('')), null);
});
