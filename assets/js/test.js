// 시작 + 문항 화면
import { loadAll, esc, toast } from './common.js';
import { scoreAnswers, encodePerson, decodePerson, todayStamp, ROLES } from './scoring.js';

const KEY = 'siwol-test-v1';
const app = document.getElementById('app');
let D, state;

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
  app.innerHTML = `
    <div class="eyebrow">${esc(D.copy.brand)}</div>
    <h1>${esc(c.title)}</h1>
    <div class="meta">${esc(c.subtitle)}</div>
    ${invited ? `<div class="banner">${esc(c.invited)}</div>` : ''}
    <div class="notes">
      ${c.notes.map((n, i) => `<div class="note"><b>${i === 0 ? '하나' : '둘'}, ${esc(n.title)}</b><p>${esc(n.body)}</p></div>`).join('')}
    </div>
    <div class="section-label" style="margin-top:22px">${esc(c.rolePrompt)}</div>
    <div class="roles" role="group" aria-label="${esc(c.rolePrompt)}">
      ${ROLES.map(r => `<button type="button" class="role" data-role="${r}" aria-pressed="${state.role === r}">${esc(c.roles[r])}</button>`).join('')}
    </div>
    <button type="button" class="btn btn-block" id="start" aria-disabled="${!state.role}">검사 시작하기 · ${esc(c.meta)}</button>
    <p class="small" style="margin-top:16px">${esc(c.disclaimer)}</p>`;

  app.querySelectorAll('.role').forEach(b => b.addEventListener('click', () => {
    state.role = b.dataset.role; save(); renderStart();
  }));
  app.querySelector('#start').addEventListener('click', () => {
    if (!state.role) { toast('누가 검사하시는지 먼저 골라주세요.'); return; }
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
      state = { role: null, answers: {}, page: null, invite: state.invite };
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
    finish();
  });
}

function finish() {
  const scores = scoreAnswers(D.items.items, state.answers);
  const me = { role: state.role, date: todayStamp(), scores };
  let qs = encodePerson(me);
  if (state.invite) qs += '&' + encodePerson(state.invite, 'p');
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  location.href = `result.html?${qs}`;
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
  // 배우자 초대 링크: ?ir=m&id=20261021&is=...
  const params = new URLSearchParams(location.search);
  let invite = null;
  try { invite = decodePerson(params, 'i'); } catch { invite = null; }

  state = restore() || { role: null, answers: {}, page: null, invite: null };
  if (invite) state.invite = invite;
  // 배우자가 엄마면 아빠를 기본 선택 (바꿀 수 있음)
  if (invite && !state.role) state.role = invite.role === 'm' ? 'f' : invite.role === 'f' ? 'm' : null;
  save();

  const m = /^#p(\d+)$/.exec(location.hash);
  if (m && state.role && state.page != null) { state.page = Math.min(+m[1] - 1, pageCount() - 1); renderPage(); }
  else { history.replaceState({}, '', location.pathname + location.search); renderStart(); }
})();
