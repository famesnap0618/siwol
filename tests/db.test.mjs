// supabase/migrations/0001_init.sql 을 로컬 Postgres(PGlite)에 올려 RPC 함수를 검증
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
let db;

// 엄마 목업 점수 24-31-40-30-38-28-37-22 가 나오도록 만든 응답
const MOM = [24, 31, 40, 30, 38, 28, 37, 22];
const answersFor = scores => scores.flatMap(s => {
  const base = Math.floor(s / 10), extra = s % 10;
  return Array.from({ length: 10 }, (_, i) => base + (i < extra ? 1 : 0));
});
const DAD = [38, 26, 36, 38, 30, 35, 30, 30];

const rpc = async (fn, args) => {
  const keys = Object.keys(args);
  const q = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  return (await db.query(q, keys.map(k => args[k]))).rows[0].r;
};
const rpcErr = async (fn, args, code) => {
  await assert.rejects(rpc(fn, args), e => e.message.includes(code));
};

before(async () => {
  db = new PGlite();
  // Supabase 기본 역할 흉내
  await db.exec(`create role anon; create role authenticated;`);
  await db.exec(sql);
});

test('첫 사람 제출 → 새 가족, 서버 채점', async () => {
  const r = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM) });
  assert.match(r.token, /^[A-Za-z0-9_-]{22}$/);
  assert.match(r.familyCode, /^[A-HJ-NP-Z]{2}-\d{4}$/);
  assert.equal(r.memberNo, 1);
  const g = await rpc('get_result', { p_token: r.token });
  assert.deepEqual(g.me.scores, MOM);
  assert.equal(g.partner, null);
  assert.equal(g.inviteToken, r.inviteToken);
});

test('초대 링크로 배우자 합류 → 서로의 점수가 보이고, 세 번째는 거절', async () => {
  const a = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM) });
  const chk = await rpc('check_family', { p_invite: a.inviteToken });
  assert.deepEqual(chk, { ok: true, firstRole: 'm' });

  const b = await rpc('submit_result', { p_role: 'f', p_answers: answersFor(DAD), p_invite: a.inviteToken });
  assert.equal(b.memberNo, 2);
  assert.equal(b.familyCode, a.familyCode);

  const ga = await rpc('get_result', { p_token: a.token });
  const gb = await rpc('get_result', { p_token: b.token });
  assert.deepEqual(ga.partner.scores, DAD);
  assert.deepEqual(gb.partner.scores, MOM);
  assert.equal(ga.inviteToken, null); // 합류 후에는 초대 링크를 더 주지 않음

  await rpcErr('submit_result', { p_role: 'o', p_answers: answersFor(DAD), p_invite: a.inviteToken }, 'family_full');
  assert.equal((await rpc('check_family', { p_code: a.familyCode })).reason, 'family_full');
});

test('가족 코드로 합류 (소문자·하이픈 없이 입력해도 인식)', async () => {
  const a = await rpc('submit_result', { p_role: 'f', p_answers: answersFor(DAD) });
  const loose = a.familyCode.replace('-', '').toLowerCase();
  const b = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM), p_code: loose });
  assert.equal(b.familyCode, a.familyCode);
  await rpcErr('submit_result', { p_role: 'm', p_answers: answersFor(MOM), p_code: 'ZZ-0000' }, 'family_not_found');
});

test('재검사 → 같은 구성원, 이전 결과와 연결', async () => {
  const a = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM) });
  const a2 = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(DAD), p_previous_token: a.token });
  assert.equal(a2.memberNo, 1);
  const g = await rpc('get_result', { p_token: a2.token });
  assert.deepEqual(g.previous.scores, MOM);
  assert.deepEqual(g.me.scores, DAD);
});

test('잘못된 응답·토큰 거절', async () => {
  await rpcErr('submit_result', { p_role: 'm', p_answers: Array(79).fill(3) }, 'invalid_answers');
  await rpcErr('submit_result', { p_role: 'm', p_answers: [...Array(79).fill(3), 6] }, 'invalid_answers');
  await rpcErr('submit_result', { p_role: 'x', p_answers: Array(80).fill(3) }, 'invalid_role');
  await rpcErr('get_result', { p_token: 'nope' }, 'result_not_found');
});

test('알림 신청 → 배우자 완료 시 대기열 생성', async () => {
  const a = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM) });
  await rpcErr('subscribe', { p_token: a.token, p_purpose: 'partner_done', p_channel: 'email', p_value: 'a@b.co', p_consent: false }, 'consent_required');
  await rpcErr('subscribe', { p_token: a.token, p_purpose: 'partner_done', p_channel: 'email', p_value: 'not-mail', p_consent: true }, 'invalid_contact');
  assert.deepEqual(await rpc('subscribe', { p_token: a.token, p_purpose: 'partner_done', p_channel: 'email', p_value: 'mom@example.com', p_consent: true }), { ok: true });

  await rpc('submit_result', { p_role: 'f', p_answers: answersFor(DAD), p_invite: a.inviteToken });
  const q = (await db.query(`select n.kind, n.status, n.payload, c.value from notifications n join contacts c on c.id = n.contact_id where c.value = 'mom@example.com'`)).rows;
  assert.equal(q.length, 1);
  assert.equal(q[0].status, 'pending');
  assert.equal(q[0].payload.resultToken, a.token); // 엄마 자신의 결과 링크로 안내
});

test('브라우저(anon)는 테이블을 직접 읽을 수 없음', async () => {
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query('select * from results'), /permission denied/);
    await assert.rejects(db.query('select * from contacts'), /permission denied/);
    const r = await rpc('submit_result', { p_role: 'm', p_answers: answersFor(MOM) });
    assert.ok(r.token);
  } finally {
    await db.exec('reset role');
  }
});
