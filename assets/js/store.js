(function () {
// 저장 방식 선택
//  - 서버(v2): config.supabaseUrl + supabaseAnonKey 가 있으면 Supabase RPC 사용 → result.html?t=토큰
//  - URL(v1): 서버 설정이 없으면 점수를 링크에 담음 → result.html?r=..&s=..
// v1 링크는 서버를 켠 뒤에도 계속 열린다.
const { scoreAnswers, encodePerson, decodePerson, todayStamp } = globalThis.SiwolScoring;
const { siteURL } = globalThis.SiwolCommon;

const ERR = {
  invalid_answers: '응답이 올바르지 않아요. 처음부터 다시 해 주세요.',
  invalid_role: '누가 검사하는지 다시 골라 주세요.',
  family_not_found: '가족 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.',
  family_full: '이미 두 분이 검사를 마친 가족 코드예요.',
  result_not_found: '결과를 찾을 수 없어요.',
  consent_required: '개인정보 수집·이용에 동의해 주세요.',
  invalid_contact: '연락처 형식을 확인해 주세요.',
};

class StoreError extends Error {
  constructor(code) { super(ERR[code] || '잠시 후 다시 시도해 주세요.'); this.code = code; }
}

function createStore(config) {
  const remote = !!(config.supabaseUrl && config.supabaseAnonKey);

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
        body: JSON.stringify(args),
      });
    } catch { throw new StoreError('network'); }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = Object.keys(ERR).find(k => (body?.message || '').includes(k));
      throw new StoreError(code || 'server');
    }
    return body;
  }

  return {
    remote,
    StoreError,

    /** 검사 제출 → 결과 페이지 주소 */
    async submit({ role, answers, items, invite, code, prevToken, itemsVersion }) {
      if (remote) {
        const arr = items.map(it => answers[it.id]);
        const r = await rpc('submit_result', {
          p_role: role, p_answers: arr,
          p_invite: invite?.token || null, p_code: code || null,
          p_previous_token: prevToken || null, p_items_version: itemsVersion || 1,
        });
        return `result.html?t=${encodeURIComponent(r.token)}`;
      }
      const me = { role, date: todayStamp(), scores: scoreAnswers(items, answers) };
      let qs = encodePerson(me);
      if (invite?.person) qs += '&' + encodePerson(invite.person, 'p');
      return `result.html?${qs}`;
    },

    /** 결과 페이지 데이터. 반환 { me, partner, previous, familyCode, inviteToken, token, mode } */
    async load(params) {
      const token = params.get('t');
      if (token) {
        if (!remote) throw new StoreError('result_not_found');
        const r = await rpc('get_result', { p_token: token });
        return { ...r, token, mode: 'remote' };
      }
      const me = decodePerson(params);
      if (!me) { const e = new StoreError('empty'); e.empty = true; throw e; }
      return { me, partner: decodePerson(params, 'p'), previous: null, mode: 'url' };
    },

    /** 시작 화면: 초대 링크 / 가족 코드 확인 */
    async checkFamily({ invite, code }) {
      if (!remote) return { ok: false, reason: 'server_off' };
      return rpc('check_family', { p_invite: invite || null, p_code: code || null });
    },

    async subscribe(token, purpose, channel, value) {
      return rpc('subscribe', { p_token: token, p_purpose: purpose, p_channel: channel, p_value: value, p_consent: true });
    },

    /** 배우자 초대 링크 */
    inviteURL(data) {
      if (data.mode === 'remote') return data.inviteToken ? siteURL(config, `index.html?inv=${encodeURIComponent(data.inviteToken)}`) : null;
      return siteURL(config, `index.html?${encodePerson(data.me, 'i')}`);
    },

    /** 내 결과 다시 보기 링크 */
    resultURL(data, swap = false) {
      if (data.mode === 'remote') return siteURL(config, `result.html?t=${encodeURIComponent(data.token)}`);
      const [a, b] = swap ? [data.partner, data.me] : [data.me, data.partner];
      return siteURL(config, `result.html?${encodePerson(a)}${b ? '&' + encodePerson(b, 'p') : ''}`);
    },

    /** 6개월 뒤 재검사 링크 (서버 모드에서만 이전 결과와 연결) */
    retestURL(data) {
      return data.mode === 'remote' ? `index.html?prev=${encodeURIComponent(data.token)}` : 'index.html';
    },
  };
}

globalThis.SiwolStore = { createStore, StoreError };
})();
