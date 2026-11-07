(function () {
// 결과 페이지 (본 결과 + 부부 비교)
const { loadAll, esc, fill, fmtDate, shareLink, copyText, toast, ICON } = globalThis.SiwolCommon;
const { evaluate, interpret, compareCouple, idealRange } = globalThis.SiwolScoring;
const { radarSVG } = globalThis.SiwolRadar;

const app = document.getElementById('app');
let D, me, partner, evMe, evPartner, data, store;

const roleName = (p, other) => {
  const n = D.copy.start.roles[p.role];
  return other && other.role === p.role ? `${n}(${p === me ? '나' : '배우자'})` : n;
};
const areaByKey = k => D.areas.areas.find(a => a.key === k);
const partsLink = parts => parts.map(n => `PART ${n} 「${esc(D.areas.areas[n - 1].name)}」`).join(' · ');

// ---------- 본 결과 ----------
function areaBody(r) {
  const a = r.area, b = a.bands[r.band];
  const [lo, hi] = idealRange(a);
  const pos = v => ((v - 10) / 40) * 100;
  const off = r.band === 'low' ? `경계에서 ${r.distance}점 아래` : r.band === 'high' ? `경계에서 ${r.distance}점 위` : '적정 범위 안';
  return `
    <div class="track" aria-hidden="true">
      <div class="ideal" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></div>
      <div class="pin ${r.band === 'ideal' ? 'ideal-pin' : ''}" style="left:${pos(r.score)}%"></div>
    </div>
    <div class="track-meta"><span>적정 범위 ${lo}~${hi}점</span><span class="${r.band === 'ideal' ? '' : 'off'}">${off}</span></div>
    <p class="line">${esc(b.line)}</p>
    <div class="quote">${esc(b.teaser)}</div>
    <div class="book-link"><b>${esc(fill(D.copy.result.bookLink, { part: a.no, name: a.name }))}</b><span>${esc(b.more)}</span></div>`;
}

function chip(r) {
  const b = r.area.bands[r.band];
  return `<span class="chip ${r.band === 'ideal' ? 'ideal' : 'out'}">${esc(b.short)}</span>`;
}

function renderAreas() {
  // 가장 멀리 벗어난 두 영역은 펼쳐서 위에, 나머지는 번호 순 접힘 목록
  const out = evMe.rows.filter(r => r.band !== 'ideal')
    .sort((x, y) => y.distance - x.distance || x.index - y.index).slice(0, 2)
    .sort((x, y) => x.index - y.index);
  const openKeys = new Set(out.map(r => r.key));
  const rest = evMe.rows.filter(r => !openKeys.has(r.key));
  return `
    ${out.map(r => `
      <div class="card area-card">
        <div class="head"><h3>${r.area.no} ${esc(r.area.name)}</h3><span class="score">${r.score}점</span>${chip(r)}</div>
        ${areaBody(r)}
      </div>`).join('')}
    <div class="card acc" style="margin-top:14px">
      ${rest.map(r => `
        <details>
          <summary><h3>${r.area.no} ${esc(r.area.name)}</h3><span class="score">${r.score}점</span>${chip(r)}${ICON.chev}</summary>
          <div class="body area-card">${areaBody(r)}</div>
        </details>`).join('')}
    </div>`;
}

function renderInterpretation() {
  const R = D.copy.result;
  const { combo, shape, focus } = interpret(evMe, D.combos.combos, { excludeConsistencyHigh: D.config.excludeConsistencyHighInPairs });
  const shapeObj = shape && D.shapes.shapes.find(s => s.id === shape);
  const arrow = d => `<span class="arrow">${d === 'high' ? '↑' : '↓'}</span>`;

  if (combo) {
    const c = combo.top, a = areaByKey(c.a), b = areaByKey(c.b);
    const shapeLine = shapeObj && shape !== 'A'
      ? `<div class="shape-note"><div><b>${esc(R.shapePrefix)}</b> ${shape === 'D' ? `둘러볼 영역이 ${evMe.outCount}개입니다. ` : ''}${esc(shapeObj.text)}</div></div>` : '';
    const rest = combo.total - 1;
    return `
      <div class="card combo">
        <div class="top"><span class="label">${esc(combo.soft ? R.comboTitleSoft : R.comboTitle)}</span><span class="badge">${esc(R.comboBadge)}</span></div>
        <h3>${esc(a.name)} ${arrow(c.aDir)}<span class="plus">+</span>${esc(b.name)} ${arrow(c.bDir)}</h3>
        <p>${esc(c.text)}</p>
        ${shapeLine}
        <div class="more"><span>${fill(esc(R.comboMore), { total: `<b>${combo.total}개</b>` })}</span>${rest > 0 ? `<a href="${esc(D.config.bookUrl || '#book')}">${esc(fill(R.comboMoreLink, { rest }))}</a>` : ''}</div>
        <p class="small" style="margin-top:8px">→ 책 ${partsLink(c.parts)}</p>
      </div>`;
  }
  if (shapeObj) {
    return `
      <div class="card combo">
        <div class="top"><span class="label">${esc(R.shapePrefix)}</span></div>
        <p style="margin-top:10px">${shape === 'D' ? `둘러볼 영역이 ${evMe.outCount}개입니다. ` : ''}${esc(shapeObj.text)}</p>
        <p class="small" style="margin-top:10px">→ 책 ${shapeObj.parts ? partsLink(shapeObj.parts) : esc(shapeObj.book)}</p>
      </div>`;
  }
  if (focus) {
    return `
      <div class="card combo">
        <div class="top"><span class="label">${esc(R.focusTitle)}</span></div>
        <h3>${esc(focus.area.name)} ${arrow(focus.band)}</h3>
        <p>${esc(fill(R.focusText, { name: focus.area.name }))}</p>
        <p class="small" style="margin-top:10px">→ 책 ${partsLink([focus.area.no])}</p>
      </div>`;
  }
  return '';
}

function miniRadarIcon() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#f3e9dc"/><polygon points="32,12 46,18 52,32 46,46 32,52 18,46 12,32 18,18" fill="none" stroke="#d9cbb8" stroke-width="1.5"/><polygon points="32,18 43,22 47,32 42,42 32,44 21,43 17,32 22,21" fill="#ee7d2b" fill-opacity=".15" stroke="#ee7d2b" stroke-width="2"/></svg>`;
}

function renderCoupleSlot() {
  const R = D.copy.result;
  if (!partner) {
    return `
      <div class="card locked">
        <div class="top"><span>${esc(R.lockedTitle)}</span><span class="lock">${ICON.lock} ${esc(R.lockedBadge)}</span></div>
        <div class="body">${miniRadarIcon()}<p>${R.lockedBody}</p></div>
        ${data.mode === 'remote' ? `
        <div class="box family">
          <div><div class="small">우리 가족 코드</div><div class="code">${esc(data.familyCode)}</div></div>
          ${data.inviteToken ? `<button type="button" class="btn blue" data-act="invite">배우자에게 링크 보내기</button>` : ''}
        </div>
        ${subscribeForm('partner_done', R.partnerDoneLabel)}
        <p class="small" style="margin-top:10px">${esc(R.lockedNoteRemote)}</p>` : `
        <button type="button" class="btn blue btn-block" data-act="invite">배우자에게 링크 보내기</button>
        <p class="small" style="margin-top:10px">${esc(R.lockedNote)}</p>`}
      </div>`;
  }
  const { gap } = compareCouple(evMe, evPartner);
  return `
    <div class="card locked" style="border-style:solid;border-color:var(--line);background:#fff">
      <div class="top"><span>${esc(R.lockedTitle)}</span><span class="lock" style="color:var(--blue)">${esc(roleName(partner, me))} ${fmtDate(partner.date, false)} 완료</span></div>
      <p style="margin:12px 0">${gap
        ? `두 선이 가장 벌어진 영역은 <b>${esc(gap.area.name)}</b>입니다. (차이 ${gap.diff}점)`
        : esc(D.couple.same)}</p>
      <button type="button" class="btn blue btn-block" data-act="compare">두 지도를 겹쳐 보기 →</button>
    </div>`;
}

function renderMain() {
  const R = D.copy.result;
  const series = [{ scores: me.scores, bands: evMe.rows.map(r => r.band) }];
  const prev = data.previous;
  if (prev) series.push({ scores: prev.scores, color: '#a99f94', dashed: true });
  app.innerHTML = `
    <div class="eyebrow">${esc(D.copy.brand)}</div>
    <h1>${esc(R.title)}</h1>
    <div class="meta">${fmtDate(me.date)} · ${esc(D.copy.start.roles[me.role])}</div>

    <div class="radar-wrap">${radarSVG({ areas: D.areas.areas, series, scoreLabels: true })}</div>
    <div class="legend"><span><i class="lg-band"></i>적정 범위</span><span><i class="lg-dot"></i>둘러볼 영역</span><span><i class="lg-dot hollow"></i>적정</span>${prev ? `<span><i class="lg-line dash" style="border-color:#a99f94"></i>지난 검사 ${fmtDate(prev.date, false)}</span>` : ''}</div>

    <div class="card summary">
      <h2>${esc(fill(R.summary, { n: evMe.idealCount, m: evMe.outCount }))}</h2>
      <p>${esc(R.summarySub)}</p>
      <hr class="divider">
      <p class="small">${esc(R.disclaimer)}</p>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button type="button" class="btn" data-act="image">${ICON.share}지도 이미지 저장</button>
      <button type="button" class="btn outline" data-act="${partner ? 'compare' : 'invite'}">${ICON.people}${partner ? '겹쳐 보기' : '배우자에게 보내기'}</button>
    </div>
    <p class="hint">${esc(R.inviteHint)}</p>

    <div class="section-label">영역별로 보기</div>
    ${renderAreas()}

    <div style="margin-top:14px">${renderInterpretation()}</div>

    <div style="margin-top:14px">${renderCoupleSlot()}</div>

    <div class="card book" id="book" style="margin-top:14px">
      <div class="label">이 결과를 읽는 책</div>
      <h3>${esc(D.copy.bookTitle)}</h3>
      <p>${esc(R.bookIntro)}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="notify">출간 알림 받기</button>
        <button type="button" class="btn ghost-dark" data-act="save">결과 저장</button>
      </div>
      <div id="book-form" class="hidden" style="margin-top:14px">${subscribeForm('book_release', R.notify)}</div>
    </div>
    <p class="footnote">${esc(R.retest)}</p>
    <p class="footnote"><a href="${esc(store.retestURL(data))}">검사 다시 하기</a></p>`;
}

// ---------- 부부 비교 ----------
function renderCompare() {
  const P = D.copy.compare;
  const { gap, rows } = compareCouple(evMe, evPartner);
  const nameMe = roleName(me, partner), nameYou = roleName(partner, me);
  const shortOf = (key, band) => areaByKey(key).bands[band].short;
  let gapCard = `<div class="card"><p style="margin:0">${esc(D.couple.same)}</p></div>`;
  if (gap) {
    const pat = D.couple.patterns.find(p => p.area === gap.key && p.pattern === gap.pattern);
    gapCard = `
      <div class="card gap">
        <div class="label">${esc(P.gapLabel)}</div>
        <h3>${esc(gap.area.name)}<small>차이 ${gap.diff}점</small></h3>
        <div class="pair">
          <div class="me"><div class="who">${esc(nameMe)}</div><div class="val">${gap.a}<small>${esc(shortOf(gap.key, gap.bandA))}</small></div></div>
          <div class="you"><div class="who">${esc(nameYou)}</div><div class="val">${gap.b}<small>${esc(shortOf(gap.key, gap.bandB))}</small></div></div>
        </div>
        <div class="ptitle">${esc(D.couple.patternTitle[gap.pattern])}</div>
        <p class="ptext">${esc(pat ? pat.text : '')}</p>
        <p class="small" style="margin-top:14px">${esc(fill(P.gapIntro, { name: gap.area.name }))}</p>
        <div class="book-link" style="margin-top:12px"><b>→ 책 ${pat ? partsLink(pat.parts) : ''}</b><span>나머지 7영역 → 책</span></div>
      </div>`;
  }
  app.innerHTML = `
    <button type="button" class="back" data-act="main">${ICON.back}내 결과로</button>
    <h1 style="margin-top:10px">${esc(P.title)}</h1>
    <div class="meta">${esc(nameMe)} ${fmtDate(me.date, false)} · ${esc(nameYou)} ${fmtDate(partner.date, false)}</div>
    <div class="radar-wrap">${radarSVG({ areas: D.areas.areas, series: [{ scores: me.scores }, { scores: partner.scores, dashed: true }], highlight: gap ? gap.index : -1 })}</div>
    <div class="legend"><span><i class="lg-line"></i>${esc(nameMe)}</span><span><i class="lg-line dash"></i>${esc(nameYou)}</span><span><i class="lg-band"></i>적정 범위</span></div>
    ${gapCard}
    <div class="card acc" style="margin-top:14px">
      <table class="diff">
        <thead><tr><th>영역</th><th>${esc(nameMe)}</th><th>${esc(nameYou)}</th><th>차이</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${gap && r.key === gap.key ? 'top' : ''}"><td><b>${r.area.no} ${esc(r.area.name)}</b></td><td class="me">${r.a}</td><td class="you">${r.b}</td><td class="d">${r.diff}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="footnote">${esc(P.tableNote)}</p>
    ${data.mode === 'url' ? `<button type="button" class="btn blue btn-block" style="margin-top:16px" data-act="sendback">${esc(P.sendBack)}</button>` : ''}`;
}

// ---------- 이미지 저장 ----------
async function saveImage() {
  const W = 1080, H = 1350, font = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const radar = radarSVG({ areas: D.areas.areas, series: [{ scores: me.scores, bands: evMe.rows.map(r => r.band) }], scoreLabels: true, size: 360, fontFamily: font })
    .replace('<svg ', '<svg x="90" y="250" width="900" height="900" ');
  const R = D.copy.result;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}">
    <rect width="100%" height="100%" fill="#faf5ee"/>
    <text x="90" y="130" font-size="30" font-weight="700" fill="#ee7d2b" letter-spacing="3">${esc(D.copy.brand)}</text>
    <text x="90" y="200" font-size="64" font-weight="800" fill="#2b2622">${esc(R.title)}</text>
    <text x="90" y="250" font-size="30" fill="#8a8178">${esc(fmtDate(me.date))} · ${esc(D.copy.start.roles[me.role])}</text>
    ${radar}
    <text x="90" y="1210" font-size="36" font-weight="700" fill="#2b2622">${esc(fill(R.summary, { n: evMe.idealCount, m: evMe.outCount }))}</text>
    <text x="90" y="1270" font-size="26" fill="#8a8178">${esc(R.inviteHint)}</text>
  </svg>`;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    canvas.getContext('2d').drawImage(img, 0, 0, W, H);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `양육태도지도_${me.date}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: R.title }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    toast('지도 이미지를 저장했어요.');
  } catch (e) {
    console.error(e); toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요.');
  } finally { URL.revokeObjectURL(url); }
}

// ---------- 동작 ----------
function subscribeForm(purpose, label) {
  if (data.mode !== 'remote') return '';
  return `
    <div class="sub-form" data-purpose="${purpose}">
      <label class="small" for="em-${purpose}">${esc(label)}</label>
      <div class="sub-row"><input id="em-${purpose}" class="input" type="email" inputmode="email" autocomplete="email" placeholder="이메일 주소">
      <button type="button" class="btn" data-act="subscribe">신청</button></div>
      <label class="consent"><input type="checkbox"> ${esc(D.copy.result.consent)}${D.config.privacyUrl ? ` <a href="${esc(D.config.privacyUrl)}" target="_blank" rel="noopener">자세히</a>` : ''}</label>
    </div>`;
}

async function doSubscribe(btn) {
  const box = btn.closest('.sub-form');
  const email = box.querySelector('input[type=email]').value.trim();
  if (!box.querySelector('input[type=checkbox]').checked) { toast(new store.StoreError('consent_required').message); return; }
  if (!email) { toast('이메일 주소를 입력해 주세요.'); return; }
  btn.disabled = true;
  try {
    await store.subscribe(data.token, box.dataset.purpose, 'email', email);
    box.innerHTML = `<p class="small" style="margin:0">신청했어요. ${box.dataset.purpose === 'partner_done' ? '배우자가 검사를 마치면' : '책이 나오면'} 이메일로 알려드릴게요.</p>`;
  } catch (e) { toast(e.message); btn.disabled = false; }
}

async function act(name, btn) {
  const R = D.copy.result;
  switch (name) {
    case 'image': return saveImage();
    case 'invite': {
      const url = store.inviteURL(data);
      if (!url) { toast('이미 배우자가 합류했어요.'); return; }
      return shareLink({ title: '우리 집 양육 태도 지도 — 같이 해봐요', text: R.inviteShareText, url });
    }
    case 'compare': history.pushState({ v: 'compare' }, '', withView('compare')); renderCompare(); window.scrollTo({ top: 0 }); return;
    case 'main': history.back(); return;
    case 'sendback': return shareLink({ title: '두 지도를 겹쳐 보기', text: '우리 둘의 양육 태도 지도를 겹쳐 봤어요.', url: store.resultURL(data, true) + '&view=compare' });
    case 'save': {
      const ok = await copyText(store.resultURL(data));
      toast(ok ? '결과 링크를 복사했어요. 메모나 카카오톡 나에게 보내기에 저장해 두세요.' : '주소창의 링크를 저장해 두세요.');
      return;
    }
    case 'notify':
      if (D.config.notifyUrl) { window.open(D.config.notifyUrl, '_blank', 'noopener'); return; }
      if (data.mode === 'remote') { document.getElementById('book-form').classList.remove('hidden'); return; }
      toast('출간 알림 신청은 곧 열립니다.'); return;
    case 'subscribe': return doSubscribe(btn);
  }
}

function withView(v) {
  const p = new URLSearchParams(location.search);
  if (v) p.set('view', v); else p.delete('view');
  return `${location.pathname}?${p}`;
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { e.preventDefault(); act(b.dataset.act, b); }
});
window.addEventListener('popstate', () => {
  const v = new URLSearchParams(location.search).get('view');
  if (v === 'compare' && partner) renderCompare(); else renderMain();
  window.scrollTo({ top: 0 });
});

// 목업(결과 페이지 ver3)과 같은 예시 점수
const SAMPLE = 'result.html?r=m&d=20261021&s=24-31-40-30-38-28-37-22';

(async function init() {
  const params = new URLSearchParams(location.search);
  try {
    D = await loadAll(['areas', 'combos', 'couple', 'shapes', 'copy', 'config']);
    store = globalThis.SiwolStore.createStore(D.config);
    data = await store.load(params);
    me = data.me; partner = data.partner;
  } catch (e) {
    console.error(e);
    // 점수 없이 열었을 때(예: result.html 을 직접 연 경우)는 안내 + 예시 결과 링크
    const empty = !location.search || e.empty;
    app.innerHTML = `<div class="error-box">
      <h2>${empty ? '아직 검사 결과가 없어요' : '결과를 불러올 수 없습니다'}</h2>
      <p class="small">${empty ? '결과 페이지는 검사를 마치면 자동으로 열립니다. 검사부터 시작해 주세요.' : '링크가 잘렸거나 잘못된 것 같아요. 다시 확인해 보세요.'}</p>
      <div style="display:grid;gap:10px;margin-top:18px">
        <a class="btn" href="index.html">검사하러 가기</a>
        <a class="btn outline" href="${SAMPLE}">예시 결과 보기</a>
        <a class="btn outline" href="${SAMPLE}&pr=f&pd=20261022&ps=38-26-36-38-30-35-30-30&view=compare">예시 부부 비교 보기</a>
      </div></div>`;
    return;
  }
  evMe = evaluate(D.areas.areas, me.scores);
  if (partner) evPartner = evaluate(D.areas.areas, partner.scores);
  if (params.get('view') === 'compare' && partner) {
    history.replaceState({}, '', withView(null));
    history.pushState({ v: 'compare' }, '', withView('compare'));
    renderCompare();
  } else renderMain();
})();

})();
