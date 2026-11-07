-- 시월 검사 v2 — 가족 코드 · 결과 저장 · 알림
-- Supabase SQL Editor 에서 한 번 실행합니다.
-- 브라우저(anon)는 테이블에 직접 접근할 수 없고, 아래 RPC 함수 4개만 호출할 수 있습니다.

-- ---------- 테이블 ----------
create table if not exists families (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  invite_token text not null unique,
  created_at   timestamptz not null default now()
);

create table if not exists results (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  family_id     uuid not null references families(id) on delete cascade,
  member_no     smallint not null check (member_no in (1, 2)),
  role          text not null check (role in ('m', 'f', 'o')),
  answers       smallint[] not null check (array_length(answers, 1) = 80),
  scores        smallint[] not null check (array_length(scores, 1) = 8),
  items_version smallint not null default 1,
  previous_id   uuid references results(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists results_family_idx on results (family_id, member_no, created_at desc);

create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  result_id  uuid references results(id) on delete set null,
  member_no  smallint not null check (member_no in (1, 2)),
  purpose    text not null check (purpose in ('partner_done', 'book_release')),
  channel    text not null check (channel in ('email', 'kakao')),
  value      text not null,
  consent_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists contacts_family_idx on contacts (family_id, purpose) where deleted_at is null;

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  kind       text not null,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payload    jsonb not null default '{}'::jsonb,
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_pending_idx on notifications (created_at) where status = 'pending';

-- 브라우저 직접 접근 차단 (RLS 켜고 정책 없음 = 전부 거부)
alter table families      enable row level security;
alter table results       enable row level security;
alter table contacts      enable row level security;
alter table notifications enable row level security;
revoke all on families, results, contacts, notifications from anon, authenticated;

-- ---------- 내부 도우미 ----------
-- 22자 비밀 토큰 (uuid 의 122비트 난수 → base64url)
create or replace function _new_token() returns text
language sql volatile as $$
  select translate(rtrim(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '='), '+/', '-_');
$$;

-- 가족 코드 KJ-4821 (헷갈리는 I, O 제외). 비밀이 아니라 사람이 읽기 위한 코드
create or replace function _new_family_code() returns text
language plpgsql volatile as $$
declare
  letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text;
begin
  loop
    c := substr(letters, 1 + floor(random() * 24)::int, 1)
      || substr(letters, 1 + floor(random() * 24)::int, 1)
      || '-' || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from families where code = c);
  end loop;
  return c;
end $$;

-- 문항 80개(영역별 10개씩 순서대로) → 영역 점수 8개
create or replace function _score(p_answers smallint[]) returns smallint[]
language plpgsql immutable as $$
declare
  s smallint[] := '{}';
  i int;
begin
  if p_answers is null or array_length(p_answers, 1) <> 80 then
    raise exception 'invalid_answers';
  end if;
  for i in 1..80 loop
    if p_answers[i] is null or p_answers[i] < 1 or p_answers[i] > 5 then
      raise exception 'invalid_answers';
    end if;
  end loop;
  for i in 0..7 loop
    s := s || (select sum(v)::smallint from unnest(p_answers[i * 10 + 1 : i * 10 + 10]) v);
  end loop;
  return s;
end $$;

create or replace function _result_json(r results) returns jsonb
language sql stable as $$
  select case when r.id is null then null else jsonb_build_object(
    'role', r.role,
    'date', to_char(r.created_at at time zone 'Asia/Seoul', 'YYYYMMDD'),
    'scores', to_jsonb(r.scores),
    'memberNo', r.member_no
  ) end;
$$;

-- 가족 코드 표기 정리: 소문자·공백·하이픈 누락 허용 (kj4821 → KJ-4821)
create or replace function _norm_code(p text) returns text
language sql immutable as $$
  select case when c ~ '^[A-Z]{2}[0-9]{4}$' then substr(c, 1, 2) || '-' || substr(c, 3) else c end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as c) t;
$$;

-- ---------- RPC: 검사 제출 ----------
create or replace function submit_result(
  p_role text,
  p_answers smallint[],
  p_invite text default null,
  p_code text default null,
  p_previous_token text default null,
  p_items_version smallint default 1
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fam families;
  prev results;
  member smallint;
  tok text := _new_token();
  sc smallint[] := _score(p_answers);
begin
  if p_role is null or p_role not in ('m', 'f', 'o') then
    raise exception 'invalid_role';
  end if;

  if p_previous_token is not null then
    -- 재검사: 같은 가족·같은 구성원
    select * into prev from results where token = p_previous_token;
    if not found then raise exception 'result_not_found'; end if;
    select * into fam from families where id = prev.family_id;
    member := prev.member_no;
  elsif p_invite is not null or p_code is not null then
    -- 배우자 합류
    if p_invite is not null then
      select * into fam from families where invite_token = p_invite for update;
    else
      select * into fam from families where code = _norm_code(p_code) for update;
    end if;
    if not found then raise exception 'family_not_found'; end if;
    if exists (select 1 from results where family_id = fam.id and member_no = 2) then
      raise exception 'family_full';
    end if;
    member := 2;
  else
    -- 처음 하는 사람: 새 가족
    insert into families (code, invite_token) values (_new_family_code(), _new_token()) returning * into fam;
    member := 1;
  end if;

  insert into results (token, family_id, member_no, role, answers, scores, items_version, previous_id)
  values (tok, fam.id, member, p_role, p_answers, sc, coalesce(p_items_version, 1), prev.id);

  return jsonb_build_object('token', tok, 'familyCode', fam.code, 'inviteToken', fam.invite_token, 'memberNo', member);
end $$;

-- ---------- RPC: 결과 조회 ----------
create or replace function get_result(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me results;
  partner results;
  prev results;
  fam families;
begin
  select * into me from results where token = p_token;
  if not found then raise exception 'result_not_found'; end if;
  select * into fam from families where id = me.family_id;
  -- 배우자의 가장 최근 결과
  select * into partner from results
    where family_id = me.family_id and member_no <> me.member_no
    order by created_at desc limit 1;
  if me.previous_id is not null then
    select * into prev from results where id = me.previous_id;
  end if;
  return jsonb_build_object(
    'me', _result_json(me),
    'partner', _result_json(partner),
    'previous', _result_json(prev),
    'familyCode', fam.code,
    -- 초대 링크는 아직 배우자가 없는 첫 번째 사람에게만 준다
    'inviteToken', case when me.member_no = 1 and partner.id is null then fam.invite_token end
  );
end $$;

-- ---------- RPC: 합류 가능 확인 (시작 화면) ----------
create or replace function check_family(p_invite text default null, p_code text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  fam families;
  first_role text;
begin
  if p_invite is not null then
    select * into fam from families where invite_token = p_invite;
  else
    select * into fam from families where code = _norm_code(p_code);
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'family_not_found'); end if;
  if exists (select 1 from results where family_id = fam.id and member_no = 2) then
    return jsonb_build_object('ok', false, 'reason', 'family_full');
  end if;
  select role into first_role from results where family_id = fam.id and member_no = 1 order by created_at limit 1;
  return jsonb_build_object('ok', true, 'firstRole', first_role);
end $$;

-- ---------- RPC: 알림 신청 ----------
create or replace function subscribe(
  p_token text, p_purpose text, p_channel text, p_value text, p_consent boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me results;
  v text := trim(coalesce(p_value, ''));
begin
  if p_consent is not true then raise exception 'consent_required'; end if;
  select * into me from results where token = p_token;
  if not found then raise exception 'result_not_found'; end if;
  if p_purpose not in ('partner_done', 'book_release') or p_channel not in ('email', 'kakao') then
    raise exception 'invalid_contact';
  end if;
  if p_channel = 'email' and v !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_contact'; end if;
  if p_channel = 'kakao' then
    v := regexp_replace(v, '[^0-9]', '', 'g');
    if v !~ '^01[0-9]{8,9}$' then raise exception 'invalid_contact'; end if;
  end if;
  -- 같은 사람·같은 목적은 하나만 유지
  update contacts set deleted_at = now()
    where family_id = me.family_id and member_no = me.member_no and purpose = p_purpose and deleted_at is null;
  insert into contacts (family_id, result_id, member_no, purpose, channel, value, consent_at)
    values (me.family_id, me.id, me.member_no, p_purpose, p_channel, v, now());
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 트리거: 배우자 완료 → 알림 대기열 ----------
create or replace function _queue_partner_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.previous_id is null then
    insert into notifications (contact_id, kind, payload)
    select c.id, 'partner_done', jsonb_build_object('role', new.role, 'resultToken', r.token)
      from contacts c
      join lateral (select token from results
                     where family_id = new.family_id and member_no = c.member_no
                     order by created_at desc limit 1) r on true
     where c.family_id = new.family_id and c.member_no <> new.member_no
       and c.purpose = 'partner_done' and c.deleted_at is null;
  end if;
  return new;
end $$;

drop trigger if exists results_partner_done on results;
create trigger results_partner_done after insert on results
  for each row execute function _queue_partner_done();

-- ---------- 권한: 브라우저는 RPC 4개만 ----------
revoke all on function _new_token(), _new_family_code(), _score(smallint[]), _result_json(results), _norm_code(text), _queue_partner_done() from public, anon, authenticated;
revoke all on function submit_result(text, smallint[], text, text, text, smallint), get_result(text), check_family(text, text), subscribe(text, text, text, text, boolean) from public;
grant execute on function submit_result(text, smallint[], text, text, text, smallint), get_result(text), check_family(text, text), subscribe(text, text, text, text, boolean) to anon, authenticated;
