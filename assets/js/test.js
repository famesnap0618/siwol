(function () {
// 시작 + 문항 화면
const { loadAll, esc, toast } = globalThis.SiwolCommon;
const { decodePerson, ROLES } = globalThis.SiwolScoring;

const KEY = 'siwol-test-v1';
const app = document.getElementById('app');
let D, state, store;

function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장 불가 환경 */ } }
function restore() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
}

function pageCount() { return Math.ceil(D.items.items.length / D.config.questionsPerPage); }
function pageItems(p) { const n = D.config.questionsPerPage; return D.items.items.slice(p * n, p * n + n); }

// ---------- 시작 화면 ----------
function renderStart() {
  const c = D.copy.start;
  const invited = !!state.invite;
  // 서버 모드이고 초대 링크·재검사가 아닐 때만 가족 코드 입력란을 보여준다
  const showCode = store.remote && !invited && !state.prevToken;
  app.innerHTML = `
    <div class="eyebrow">${esc(D.copy.brand)}</div>
    <h1>${esc(c.title)}</h1>
    <div class="meta">${esc(c.subtitle)}</div>
    ${state.inviteError ? `<div class="banner warn">${esc(state.inviteError)}</div>` : ''}
    ${invited ? `<div class="banner">${esc(c.invited)}</div>` : ''}
    ${state.prevToken ? `<div class="banner">${esc(c.retest)}</div>` : ''}
    <div class="notes">
      ${c.notes.map((n, i) => `<div class="note"><b>${i === 0 ? '하나' : '둘'}, ${esc(n.title)}</b><p>${esc(n.body)}</p></div>`).join('')}
    </div>
    <div class="section-label" style="margin-top:22px">${esc(c.rolePrompt)}</div>
    <div class="roles" role="group" aria-label="${esc(c.rolePrompt)}">
      ${ROLES.map(r => `<button type="button" class="role" data-role="${r}" aria-pressed="${state.role === r}">${esc(c.roles[r])}</button>`).join('')}
    </div>
    ${showCode ? `
    <details class="code-box" ${state.code ? 'open' : ''}>
      <summary>${esc(c.codePrompt)}</summary>
      <p class="small">${esc(c.codeHelp)}</p>
      <input id="code" class="input" inputmode="text" autocomplete="off" maxlength="9" placeholder="예: KJ-4821" value="${esc(state.code || '')}">
    </details>` : ''}
    <button type="button" class="btn btn-block" id="start" aria-disabled="${!state.role}">검사 시작하기 · ${esc(c.meta)}</button>
    <p class="small" style="margin-top:16px">${esc(c.disclaimer)}</p>
    <p class="footnote"><a href="result.html?r=m&d=20261021&s=24-31-40-30-38-28-37-22">예시 결과 미리 보기</a></p>`;

  app.querySelectorAll('.role').forEach(b => b.addEventListener('click', () => {
    state.role = b.dataset.role; save(); renderStart();
  }));
  app.querySelector('#code')?.addEventListener('input', e => { state.code = e.target.value.trim(); save(); });
  app.querySelector('#start').addEventListener('click', async () => {
    if (!state.role) { toast('누가 검사하시는지 먼저 골라주세요.'); return; }
    // 가족 코드를 입력했다면 시작 전에 합류 가능한지 확인
    if (showCode && state.code) {
      try {
        const chk = await store.checkFamily({ code: state.code });
        if (!chk.ok) { toast(new store.StoreError(chk.reason).message); return; }
      } catch (e) { toast(e.message); return; }
    }
    goPage(state.page ?? 0, true);
  });
}

// ---------- 문항 화면 ----------
function goPage(p, push) {
  state.page = p; save();
  if (push) history.pushState({ page: p }, '', `#p${p + 1}`);
  renderPage();
  window.scrollTo({ top: 0 });
}

function renderPage() {
  const p = state.page, total = pageCount(), items = pageItems(p);
  const scale = D.items.scale;
  const offset = p * D.config.questionsPerPage;
  const last = p === total - 1;
  app.innerHTML = `
    <div class="topbar">
      <div class="progress" aria-hidden="true"><i style="width:${((p + 1) / total) * 100}%"></i></div>
      <div class="progress-text"><span>${total}단계 중 ${p + 1}번째</span><button type="button" class="link-btn" id="restart">처음으로</button></div>
    </div>
    ${p === 0 ? `<div class="note guide-toggle"><b>최근 1~2주간의 실제 모습을 떠올리며 답해주세요.</b><p>'이래야 하는데'가 아니라 '실제로 요즘 내가 어떤가'를, 오래 생각하지 말고 바로바로 체크하세요.</p></div>`
      : `<p class="small guide-toggle">최근 1~2주간의 실제 모습을 떠올리며 바로바로 체크하세요.</p>`}
    <div id="qs">
      ${items.map((it, i) => `
        <div class="q" id="${it.id}" role="radiogroup" aria-labelledby="${it.id}-t">
          <p id="${it.id}-t"><span class="n">${offset + i + 1}</span>${esc(it.text)}</p>
          <div class="scale">
            ${scale.map(s => `<button type="button" role="radio" data-q="${it.id}" data-v="${s.value}" aria-label="${s.value}점 ${esc(s.label)}" aria-checked="${state.answers[it.id] === s.value}">${s.value}</button>`).join('')}
          </div>
          <div class="scale-ends"><span>${esc(scale[0].label)}</span><span>${esc(scale[scale.length - 1].label)}</span></div>
        </div>`).join('')}
    </div>
    <div class="navbar">
      <button type="button" class="btn outline" id="prev">이전</button>
      <button type="button" class="btn" id="next">${last ? '결과 보기' : '다음'}</button>
    </div>`;

  const updateNext = () => {
    const done = items.every(it => state.answers[it.id]);
    app.querySelector('#next').setAttribute('aria-disabled', String(!done));
  };
  updateNext();

  app.querySelectorAll('.scale button').forEach(b => b.addEventListener('click', () => {
    const q = b.dataset.q, v = +b.dataset.v;
    state.answers[q] = v; save();
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    const card = document.getElementById(q);
    card.classList.remove('missing');
    updateNext();
    // 다음 미응답 문항으로 부드럽게 이동
    const idx = items.findIndex(it => it.id === q);
    const nextQ = items.slice(idx + 1).find(it => !state.answers[it.id]);
    if (nextQ) setTimeout(() => document.getElementById(nextQ.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }));

  app.querySelector('#prev').addEventListener('click', () => history.back());
  app.querySelector('#restart').addEventListener('click', () => {
    if (confirm('처음으로 돌아가면 지금까지의 응답이 모두 지워집니다. 계속할까요?')) {
      state = { role: null, answers: {}, page: null, invite: state.invite, prevToken: state.prevToken, code: state.code };
      save(); history.pushState({}, '', location.pathname + location.search); renderStart();
    }
  });
  app.querySelector('#next').addEventListener('click', () => {
    const missing = items.filter(it => !state.answers[it.id]);
    if (missing.length) {
      missing.forEach(it => document.getElementById(it.id).classList.add('missing'));
      document.getElementById(missing[0].id).scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(`아직 답하지 않은 문항이 ${missing.length}개 있어요.`);
      return;
    }
    if (!last) { goPage(p + 1, true); return; }
    finish(app.querySelector('#next'));
  });
}

async function finish(btn) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = '1'; btn.textContent = '결과를 만드는 중…';
  try {
    const url = await store.submit({
      role: state.role, answers: state.answers, items: D.items.items,
      invite: state.invite, code: state.code, prevToken: state.prevToken, itemsVersion: D.items.version,
    });
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
    location.href = url;
  } catch (e) {
    console.error(e);
    toast(e.message || '잠시 후 다시 시도해 주세요.');
    delete btn.dataset.busy; btn.textContent = '결과 보기';
  }
}

window.addEventListener('popstate', () => {
  const m = /^#p(\d+)$/.exec(location.hash);
  if (m && state.role) { state.page = Math.min(+m[1] - 1, pageCount() - 1); save(); renderPage(); window.scrollTo({ top: 0 }); }
  else renderStart();
});

(async function init() {
  try {
    D = await loadAll(['items', 'copy', 'config']);
  } catch (e) {
    app.innerHTML = `<div class="error-box"><h2>검사를 불러오지 못했어요</h2><p class="small">잠시 후 다시 시도해 주세요.</p></div>`;
    console.error(e); return;
  }
  store = globalThis.SiwolStore.createStore(D.config);
  const params = new URLSearchParams(location.search);

  state = restore() || { role: null, answers: {}, page: null, invite: null };
  state.inviteError = null;

  // 배우자 초대 링크 — 서버: ?inv=초대토큰 / URL 방식: ?ir=m&id=20261021&is=...
  let firstRole = null;
  if (params.get('inv')) {
    try {
      const chk = await store.checkFamily({ invite: params.get('inv') });
      if (chk.ok) { state.invite = { token: params.get('inv') }; firstRole = chk.firstRole; }
      else { state.invite = null; state.inviteError = new store.StoreError(chk.reason === 'server_off' ? 'family_not_found' : chk.reason).message; }
    } catch (e) { state.inviteError = e.message; }
  } else {
    let person = null;
    try { person = decodePerson(params, 'i'); } catch { person = null; }
    if (person) { state.invite = { person }; firstRole = person.role; }
  }
  // 재검사: ?prev=이전 결과 토큰
  if (params.get('prev') && store.remote) state.prevToken = params.get('prev');

  // 먼저 한 사람이 엄마면 아빠를 기본 선택 (바꿀 수 있음)
  if (firstRole && !state.role) state.role = firstRole === 'm' ? 'f' : firstRole === 'f' ? 'm' : null;
  save();

  const m = /^#p(\d+)$/.exec(location.hash);
  if (m && state.role && state.page != null) { state.page = Math.min(+m[1] - 1, pageCount() - 1); renderPage(); }
  else { history.replaceState({}, '', location.pathname + location.search); renderStart(); }
})();

})();
