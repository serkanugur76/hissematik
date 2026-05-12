// ══════════════════════════════════════════════
// HisseMatik — UI Katmanı
// assets/js/ui.js
// ══════════════════════════════════════════════

import {
  state, setState,
  BIST, BIST30, BIST100,
  sinyalIstatistik, portfoyOzeti, hisseAdi, aktifKey,
  DOGRULAMA_GUN_VARSAYILAN,
} from './state.js';

import { sinyalClass } from './indicators.js';

// ─────────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────────

export function el(id) { return document.getElementById(id); }

export function setStatus(type, text) {
  el('statusDot').className    = 'status-dot ' + type;
  el('statusText').textContent = text;
}

export function showLoading(msg = 'İşleniyor...') {
  el('globalLoading').classList.add('show');
  el('loadingMsg').textContent = msg;
}
export function setLoadingMsg(t) { el('loadingMsg').textContent = t; }
export function hideLoading()    { el('globalLoading').classList.remove('show'); }

let _toastTimer;
export function showToast(msg, type = 'success') {
  const t = el('toast');
  t.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '✗ ' : '') + msg;
  t.className   = 'toast show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

export function closeModal(id) { el(id).classList.remove('show'); }
export function openModal(id)  { el(id).classList.add('show'); }

// ─────────────────────────────────────────────
// KULLANICI / TOPBAR
// ─────────────────────────────────────────────

export function renderTopbar() {
  const { currentUser, isAdmin } = state;
  if (!currentUser) return;

  const name   = (currentUser.displayName || currentUser.email).split(' ')[0];
  const avatar = (currentUser.displayName || currentUser.email)[0].toUpperCase();

  el('userName').textContent   = name;
  el('userAvatar').textContent = avatar;

  const mobileUserName   = el('mobileUserName');
  const mobileUserAvatar = el('mobileUserAvatar');
  if (mobileUserName)   mobileUserName.textContent   = name;
  if (mobileUserAvatar) mobileUserAvatar.textContent = avatar;

  if (isAdmin) {
    el('adminBadge').style.display = 'inline';
    document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'block');
  }
}

// ─────────────────────────────────────────────
// PİYASA KARTLARI — Ticker bant
// ─────────────────────────────────────────────

function _fmt(sayi, ondalik = 2) {
  if (!sayi && sayi !== 0) return '—';
  return sayi.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
}

function _piyasaYonBilgi(deg) {
  if (deg >= 1.5)  return { etiket: 'Güçlü Yükseliş', cls: 'yukselis' };
  if (deg >= 0)    return { etiket: 'Yatay / +',       cls: 'yatay'    };
  if (deg >= -1.5) return { etiket: 'Hafif Düşüş',     cls: 'yatay'    };
  return                   { etiket: 'Güçlü Düşüş',    cls: 'dusus'    };
}

function _tickerItem(label, deger, degisim, tersCls = false) {
  if (!deger) return '';
  const d     = parseFloat(degisim) || 0;
  const artis = tersCls ? (d < 0) : (d >= 0);
  const cls   = artis ? 'pos' : 'neg';
  return '<div class="ticker-item">' +
    '<span class="ticker-label">' + label + '</span>' +
    '<span class="ticker-value">' + deger + '</span>' +
    '<span class="ticker-change ' + cls + '">' + (d >= 0 ? '+' : '') + d + '%</span>' +
    '</div>';
}

export function renderPiyasaKartlari() {
  const { xu100, xu030, usdtry, eurtry, eurusd, altin } = state.piyasaVerisi;

  const bist100Html = xu100 ? (() => {
    const { etiket, cls } = _piyasaYonBilgi(xu100.degisim);
    const d = xu100.degisim || 0;
    return '<div class="ticker-item">' +
      '<span class="ticker-label">BIST 100</span>' +
      '<span class="ticker-value">' + _fmt(xu100.fiyat, 0) + '</span>' +
      '<span class="ticker-change ' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '') + d + '%</span>' +
      '<span class="ticker-yon ' + cls + '">' + etiket + '</span>' +
      '</div>';
  })() : '';

  const bist30Html  = _tickerItem('BIST 30', xu030 ? _fmt(xu030.fiyat, 0) : null, xu030?.degisim);
  const usdHtml     = _tickerItem('USD/TRY', usdtry ? _fmt(usdtry.fiyat) + ' ₺' : null, usdtry?.degisim, true);
  const eurHtml     = _tickerItem('EUR/TRY', eurtry ? _fmt(eurtry.fiyat) + ' ₺' : null, eurtry?.degisim, true);
  const euusdHtml   = _tickerItem('EUR/USD', eurusd ? _fmt(eurusd.fiyat, 4) : null, eurusd?.degisim);

  let altinHtml = '';
  if (altin) {
    const d   = altin.degisim || 0;
    const cls = d >= 0 ? 'pos' : 'neg';
    const isk = d >= 0 ? '+' : '';
    if (altin.gramTL)   altinHtml += '<div class="ticker-item"><span class="ticker-label">ALTIN GR</span><span class="ticker-value">' + _fmt(altin.gramTL) + ' ₺</span><span class="ticker-change ' + cls + '">' + isk + d + '%</span></div>';
    if (altin.ceyrekTL) altinHtml += '<div class="ticker-item"><span class="ticker-label">ÇEYREK</span><span class="ticker-value">' + _fmt(altin.ceyrekTL, 0) + ' ₺</span><span class="ticker-change ' + cls + '">' + isk + d + '%</span></div>';
    if (altin.tamTL)    altinHtml += '<div class="ticker-item"><span class="ticker-label">TAM ALTIN</span><span class="ticker-value">' + _fmt(altin.tamTL, 0) + ' ₺</span><span class="ticker-change ' + cls + '">' + isk + d + '%</span></div>';
  }

  const icerik = bist100Html + bist30Html + usdHtml + eurHtml + euusdHtml + altinHtml;
  document.querySelectorAll('.ticker-bar').forEach(container => {
    container.innerHTML =
      '<div class="ticker-track">' +
        '<div class="ticker-inner">' + icerik + '</div>' +
        '<div class="ticker-inner" aria-hidden="true">' + icerik + '</div>' +
      '</div>';
  });
}

export function renderPiyasaYonu() { renderPiyasaKartlari(); }

// ─────────────────────────────────────────────
// ÖZET KARTLAR
// ─────────────────────────────────────────────

export function renderSummary() {
  const { veriler, takipEdilen } = state;
  const { dogru, yanlis, toplam, isabet } = sinyalIstatistik();
  const sumAl  = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ AL').length;
  const sumSat = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ SAT').length;

  const summaryCards = el('summaryCards');
  if (summaryCards) {
    summaryCards.className = 'summary-grid';
    summaryCards.innerHTML =
      '<div class="summary-card"><div class="sc-label">Takip Edilen</div><div class="sc-value">' + takipEdilen.size + '</div></div>' +
      '<div class="summary-card s-green"><div class="sc-label">Güçlü AL</div><div class="sc-value green">' + (sumAl || '—') + '</div></div>' +
      '<div class="summary-card s-red"><div class="sc-label">Güçlü SAT</div><div class="sc-value red">' + (sumSat || '—') + '</div></div>' +
      '<div class="summary-card s-yellow"><div class="sc-label">Sinyal İsabeti</div><div class="sc-value yellow">' + (toplam > 0 ? '%' + isabet : '—') + '</div></div>';
  } else {
    el('sumTakip')  && (el('sumTakip').textContent  = takipEdilen.size);
    el('sumAl')     && (el('sumAl').textContent     = sumAl  || '—');
    el('sumSat')    && (el('sumSat').textContent    = sumSat || '—');
    el('sumIsabet') && (el('sumIsabet').textContent = toplam > 0 ? '%' + isabet : '—');
  }

  el('sinTopToplam') && (el('sinTopToplam').textContent = state.sinyalGecmisi.length);
  el('sinTopDogru')  && (el('sinTopDogru').textContent  = dogru);
  el('sinTopYanlis') && (el('sinTopYanlis').textContent = yanlis);
  el('sinTopIsabet') && (el('sinTopIsabet').textContent = toplam > 0 ? '%' + isabet : '—');
}

// ─────────────────────────────────────────────
// DASHBOARD TABLOSU
// ─────────────────────────────────────────────

export function renderDashboard() {
  const { veriler, takipEdilen, sinyalGecmisi } = state;
  const container = el('dashTableBody');
  const rows = Object.entries(veriler).filter(([k]) => takipEdilen.has(k));

  if (rows.length === 0) {
    if (container) container.innerHTML =
      '<tr><td colspan="9" class="empty-state" style="padding:3rem">Henüz veri yok — Hisseler sekmesinden hisse seç, ardından Güncelle düğmesine bas.</td></tr>';
    return;
  }

  const lastSinyal = sinyalGecmisi[0];
  const aiBox = el('aiBoxContainer');
  if (aiBox && lastSinyal?.aiYorum) {
    aiBox.innerHTML =
      '<div class="ai-glass">' +
        '<div class="ai-glass-header">' +
          '<div class="ai-glass-icon">⬡</div>' +
          '<span class="ai-glass-title">Claude AI Portföy Analizi</span>' +
          '<span class="ai-glass-time">' + new Date(lastSinyal.tarih).toLocaleString('tr-TR') + '</span>' +
        '</div>' +
        '<div class="ai-glass-content">' + lastSinyal.aiYorum + '</div>' +
      '</div>';
  }

  if (container) {
    container.innerHTML = rows.map(([k, v]) => {
      const rsiPct   = Math.min(100, Math.max(0, v.rsi || 50));
      const rsiColor = v.rsi < 30 ? 'var(--accent)' : v.rsi > 70 ? 'var(--red)' : 'var(--yellow)';
      const cls      = sinyalClass(v.sinyal);
      const degCls   = v.degisim >= 0 ? 'pos' : 'neg';
      const guvenStr = v.guvenSkoru != null ? v.guvenSkoru + '%' : 'veri bekleniyor';
      const guven    = v.guvenSkoru ?? 0;
      const guvenCls = guven >= 70 ? 'high' : guven >= 50 ? 'medium' : 'low';
      const hacimTxt = v.hacimFark > 0
        ? '<span class="pos">+' + v.hacimFark + '%</span>'
        : v.hacimFark < 0 ? '<span class="neg">' + v.hacimFark + '%</span>' : '<span class="muted">—</span>';
      const macdRenk = v.macdHist > 0 ? 'var(--accent)' : 'var(--red)';
      const bolRenk  = v.bollinger?.yuzde < 25 ? 'var(--accent)' : v.bollinger?.yuzde > 75 ? 'var(--red)' : 'var(--muted)';
      const degIsaret = v.degisim >= 0 ? '+' : '';

      return '<tr>' +
        '<td><span class="mono" style="font-weight:600;cursor:pointer;color:var(--accent)" onclick="hisseDetayAc(\'' + k + '\')">' + k + '</span></td>' +
        '<td class="mono" style="font-weight:500">' + (v.fiyat ?? '—') + ' ₺</td>' +
        '<td class="mono ' + degCls + '">' + degIsaret + v.degisim + '%</td>' +
        '<td><div class="rsi-wrap"><div class="rsi-bar"><div class="rsi-fill" style="width:' + rsiPct + '%;background:' + rsiColor + '"></div></div><span class="mono" style="font-size:0.75rem;color:' + rsiColor + ';min-width:28px">' + v.rsi + '</span></div></td>' +
        '<td><span class="sinyal-badge ' + cls + '">' + v.sinyal + '</span></td>' +
        '<td><div class="guven-wrap"><div class="guven-bar"><div class="guven-fill ' + guvenCls + '" style="width:' + guven + '%"></div></div><span class="guven-pct">' + guvenStr + '</span></div></td>' +
        '<td class="mono" style="font-size:0.72rem;color:' + macdRenk + '">' + (v.macdHist?.toFixed(3) ?? '—') + '</td>' +
        '<td>' + hacimTxt + '</td>' +
        '<td class="mono" style="font-size:0.72rem;color:' + bolRenk + '">' + (v.bollinger ? v.bollinger.yuzde + '%' : '—') + '</td>' +
        '</tr>';
    }).join('');
  }
}

// ─────────────────────────────────────────────
// HİSSE LİSTESİ (GRID)
// ─────────────────────────────────────────────

export function renderHisseler() {
  const { veriler, takipEdilen, portfoy, aktifFilter: filtre } = state;
  const q    = (el('searchInput')?.value || '').toLowerCase();
  const grid = el('hisseGrid');
  grid.innerHTML = '';

  const _bistKodlar = new Set(BIST.map(([k]) => k));
  const _ekstra     = Object.keys(veriler).filter(k => !_bistKodlar.has(k)).map(k => [k, k + ' (Özel)']);
  const _tumListe   = [...BIST, ..._ekstra];

  _tumListe
    .filter(([k, a]) => {
      if (filtre === 'takip'   && !takipEdilen.has(k)) return false;
      if (filtre === 'portfoy' && !portfoy[k])         return false;
      if (filtre === 'bist30'  && !BIST30.has(k))      return false;
      if (filtre === 'bist100' && !BIST100.has(k))     return false;
      if (q && !k.toLowerCase().includes(q) && !a.toLowerCase().includes(q)) return false;
      return true;
    })
    .forEach(([k, a]) => {
      const isTakip = takipEdilen.has(k);
      const isPF    = !!portfoy[k];
      const v       = veriler[k];
      const card    = document.createElement('div');

      let cardStyle   = '';
      let degisimHTML = '';
      if (v) {
        if      (v.degisim > 0) cardStyle = 'border-color:rgba(0,229,160,0.4);background:rgba(0,229,160,0.05)';
        else if (v.degisim < 0) cardStyle = 'border-color:rgba(255,69,96,0.4);background:rgba(255,69,96,0.05)';
        degisimHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.4rem">' +
            '<span style="font-family:var(--mono);font-size:0.78rem;font-weight:500">' + v.fiyat + ' ₺</span>' +
            '<span style="font-family:var(--mono);font-size:0.7rem;color:' + (v.degisim >= 0 ? 'var(--accent)' : 'var(--red)') + '">' +
              (v.degisim >= 0 ? '+' : '') + v.degisim + '%' +
            '</span>' +
          '</div>';
      }

      card.className = 'hisse-card' + (isTakip ? ' takip' : '') + (isPF ? ' portfoy' : '');
      if (cardStyle) card.setAttribute('style', cardStyle);

      const sc  = v?.sinyal ? sinyalClass(v.sinyal) : 'bekle';
      const sc2 = v?.sinyal?.includes('GÜÇLÜ') ? (v.sinyal.includes('AL') ? 'guclu-al' : 'guclu-sat') : sc;

      card.innerHTML =
        '<div class="h-check">' + (isTakip ? '✓' : '') + '</div>' +
        '<div class="h-kod">' + k + '</div>' +
        '<div class="h-ad">' + a + '</div>' +
        degisimHTML +
        '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:0.3rem">' +
          (isTakip && v?.sinyal ? '<span class="pill ' + sc + '" style="font-size:0.6rem">' + v.sinyal + '</span>' : '') +
          (isPF ? '<span class="pill bekle" style="font-size:0.6rem">PORTFÖY</span>' : '') +
          (!isTakip && v?.sinyal ? '<span class="pill ' + sc2 + '" style="font-size:0.58rem">' + v.sinyal + '</span>' : '') +
        '</div>';

      card.onclick       = (e) => { if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return; window._uiCallbacks?.toggleTakip(k); };
      card.oncontextmenu = (e) => { e.preventDefault(); portfoyModalAc(k, a); };
      grid.appendChild(card);

      if (v) {
        const btn = document.createElement('button');
        btn.textContent  = '🔍 Analiz Et';
        btn.style.cssText = 'font-size:0.62rem;padding:2px 8px;margin-top:0.4rem;background:var(--accent-dim);border:1px solid rgba(0,229,160,0.3);border-radius:4px;color:var(--accent);cursor:pointer;width:100%';
        btn.addEventListener('click', (e) => { e.stopPropagation(); hisseDetayAc(k); });
        card.appendChild(btn);
      }
    });
}

// ─────────────────────────────────────────────
// SİNYAL GEÇMİŞİ
// ─────────────────────────────────────────────

export function renderSinyalGecmisi() {
  const { sinyalGecmisi, dogrulamaGun } = state;
  const listeEl = el('sinyalListesi');

  if (sinyalGecmisi.length === 0) {
    listeEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)">Henüz sinyal geçmişi yok.</div>';
    return;
  }

  listeEl.innerHTML = sinyalGecmisi.slice(0, 50).map(s => {
    const tarih      = new Date(s.tarih).toLocaleDateString('tr-TR');
    const saat       = new Date(s.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const sonucPill  = s.dogrulandi === null
      ? '<span class="pill bekliyor">⏳ ' + dogrulamaGun + ' gün bekleniyor</span>'
      : s.dogrulandi
        ? '<span class="pill dogrulandi">✓ Doğrulandı</span>'
        : '<span class="pill yanlis">✗ Yanlışlandı</span>';
    const sonucYuzde = s.sonucYuzde !== null
      ? '<span class="' + (s.sonucYuzde >= 0 ? 'pos' : 'neg') + ' mono">' + (s.sonucYuzde >= 0 ? '+' : '') + s.sonucYuzde + '%</span>'
      : '<span class="muted">—</span>';

    return '<div class="sinyal-item">' +
      '<div class="sinyal-item-top">' +
        '<span class="mono" style="font-weight:500">' + s.sembol + '</span>' +
        '<span class="pill ' + sinyalClass(s.sinyal) + '">' + s.sinyal + '</span>' +
        sonucPill + ' ' + sonucYuzde +
      '</div>' +
      '<div class="sinyal-item-meta">' +
        '<span>📅 ' + tarih + ' ' + saat + '</span>' +
        '<span>Fiyat: <span class="mono">' + s.fiyat + '₺</span></span>' +
        '<span>RSI: <span class="mono">' + s.rsi?.toFixed(0) + '</span></span>' +
        '<span>Hacim: <span class="mono ' + (s.hacimFark > 0 ? 'pos' : 'muted') + '">' + (s.hacimFark > 0 ? '+' : '') + s.hacimFark + '%</span></span>' +
        (s.sonucFiyat ? '<span>Sonuç: <span class="mono">' + s.sonucFiyat + '₺</span></span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

// ─────────────────────────────────────────────
// PORTFÖY
// ─────────────────────────────────────────────

export function renderPortfoy() {
  const { portfoy, veriler } = state;
  const wrapper = el('portfoyContent');
  const items   = Object.entries(portfoy);

  if (items.length === 0) {
    wrapper.innerHTML =
      '<div style="text-align:center;padding:5rem;color:var(--muted)">' +
        '<div style="font-size:2rem;margin-bottom:1rem">💼</div>' +
        '<div style="margin-bottom:0.5rem;color:var(--text)">Portföyünüz boş</div>' +
        '<div style="font-size:0.8rem">Hisse listesinde sağ tıklayarak portföye ekle</div>' +
      '</div>';
    return;
  }

  const { totMaliyet, totDeger, kz, kzp } = portfoyOzeti();

  const rows = items.map(([k, p]) => {
    const v      = veriler[k];
    const gf     = v?.fiyat || 0;
    const mal    = p.adet * p.alisFiyati;
    const deg    = gf ? p.adet * gf : 0;
    const kzSat  = deg - mal;
    const kzpSat = mal > 0 ? (kzSat / mal * 100) : 0;
    const sin    = v ? '<span class="pill ' + sinyalClass(v.sinyal) + '">' + v.sinyal + '</span>' : '—';

    return '<tr>' +
      '<td><span class="mono" style="font-weight:500">' + k + '</span><br><span class="muted" style="font-size:0.68rem">' + (p.ad || '') + '</span></td>' +
      '<td class="mono">' + p.adet + '</td>' +
      '<td class="mono">' + p.alisFiyati.toFixed(2) + ' ₺</td>' +
      '<td class="mono">' + (gf ? gf.toFixed(2) + ' ₺' : '—') + '</td>' +
      '<td class="mono">' + mal.toFixed(0) + ' ₺</td>' +
      '<td class="mono">' + (deg ? deg.toFixed(0) + ' ₺' : '—') + '</td>' +
      '<td class="mono ' + (kzSat >= 0 ? 'pos' : 'neg') + '">' + (kzSat >= 0 ? '+' : '') + kzSat.toFixed(0) + ' ₺<br><span style="font-size:0.72rem">' + (kzpSat >= 0 ? '+' : '') + kzpSat.toFixed(1) + '%</span></td>' +
      '<td>' + sin + '</td>' +
      '<td><button class="btn danger" onclick="window._uiCallbacks?.portfoyCikar(\'' + k + '\')" style="font-size:0.72rem;padding:0.3rem 0.6rem">Çıkar</button></td>' +
      '</tr>';
  }).join('');

  wrapper.innerHTML =
    '<div class="portfoy-summary">' +
      '<div class="grid-4" style="margin-bottom:0">' +
        '<div><div class="card-title">Toplam Maliyet</div><div class="card-value" style="font-size:1.2rem">' + totMaliyet.toFixed(0) + ' ₺</div></div>' +
        '<div><div class="card-title">Güncel Değer</div><div class="card-value" style="font-size:1.2rem">' + totDeger.toFixed(0) + ' ₺</div></div>' +
        '<div><div class="card-title">Toplam K/Z</div><div class="card-value ' + (kz >= 0 ? 'green' : 'red') + '" style="font-size:1.2rem">' + (kz >= 0 ? '+' : '') + kz.toFixed(0) + ' ₺</div></div>' +
        '<div><div class="card-title">Getiri</div><div class="card-value ' + (kzp >= 0 ? 'green' : 'red') + '" style="font-size:1.2rem">' + (kzp >= 0 ? '+' : '') + kzp.toFixed(1) + '%</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="table-wrap"><table>' +
      '<thead><tr><th>Hisse</th><th>Adet</th><th>Alış</th><th>Güncel</th><th>Maliyet</th><th>Değer</th><th>K/Z</th><th>Sinyal</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';
}

// ─────────────────────────────────────────────
// PORTFÖY MODALI
// ─────────────────────────────────────────────

export function portfoyModalAc(k, a) {
  setState({ portfoyKod: k });
  el('portfoyModalTitle').textContent = k + ' — Portföye Ekle';
  el('portfoyModalSub').textContent   = a;
  el('pTarih').value = new Date().toISOString().split('T')[0];
  openModal('portfoyModal');
}

// ─────────────────────────────────────────────
// HİSSE DETAY MODALI
// ─────────────────────────────────────────────

export function renderHisseDetay(kod) {
  const { veriler, takipEdilen, portfoy, piyasaVerisi, sinyalGecmisi, haberlerData } = state;
  const v  = veriler[kod];
  const ad = hisseAdi(kod);

  el('detayHisseAdi').textContent    = kod;
  el('detayHisseSirket').textContent = ad;

  const takipBtn = el('detayTakipBtn');
  if (takipEdilen.has(kod)) { takipBtn.textContent = '★ Takipte'; takipBtn.style.color = 'var(--accent)'; }
  else                       { takipBtn.textContent = '☆ Takibe Al'; takipBtn.style.color = ''; }

  const ozetEl = el('detayOzetKartlar');
  if (v) {
    const degCls    = v.degisim >= 0 ? 'var(--accent)' : 'var(--red)';
    const sinyalCls = sinyalClass(v.sinyal);
    const guven     = v.guvenSkoru ?? 0;
    const guvenCls  = guven >= 70 ? 'high' : guven >= 50 ? 'medium' : 'low';
    const rsiColor  = v.rsi < 30 ? 'var(--accent)' : v.rsi > 70 ? 'var(--red)' : 'var(--yellow)';
    const rsiEtiket = v.rsi < 30 ? 'Aşırı Satım' : v.rsi > 70 ? 'Aşırı Alım' : 'Nötr';
    const macdRenk  = v.macdHist > 0 ? 'var(--accent)' : 'var(--red)';
    const stochRenk = (v.stochRsi?.k ?? 50) < 20 ? 'var(--accent)' : (v.stochRsi?.k ?? 50) > 80 ? 'var(--red)' : 'var(--text)';
    const stochSub  = (v.stochRsi?.k ?? 50) < 20 ? 'Aşırı Satım' : (v.stochRsi?.k ?? 50) > 80 ? 'Aşırı Alım' : 'Nötr';

    ozetEl.innerHTML =
      '<div class="detay-hero" style="grid-column:1/-1">' +
        '<div>' +
          '<div class="detay-hero-fiyat">' + v.fiyat + ' ₺</div>' +
          '<div class="detay-hero-degisim" style="color:' + degCls + '">' + (v.degisim >= 0 ? '+' : '') + v.degisim + '%</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem">' +
          '<span class="sinyal-badge ' + sinyalCls + '">' + v.sinyal + '</span>' +
          '<div class="guven-wrap" style="justify-content:flex-end;min-width:100px">' +
            '<div class="guven-bar"><div class="guven-fill ' + guvenCls + '" style="width:' + guven + '%"></div></div>' +
            '<span class="guven-pct">' + guven + '%</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detay-micro-card ' + (v.rsi < 30 ? 'accent' : v.rsi > 70 ? 'danger' : '') + '">' +
        '<div class="detay-mc-label">RSI (14)</div>' +
        '<div class="detay-mc-value" style="color:' + rsiColor + '">' + v.rsi + '</div>' +
        '<div class="detay-mc-sub">' + rsiEtiket + '</div>' +
      '</div>' +
      '<div class="detay-micro-card ' + (v.macdHist > 0 ? 'accent' : 'danger') + '">' +
        '<div class="detay-mc-label">MACD Hist</div>' +
        '<div class="detay-mc-value" style="color:' + macdRenk + '">' + (v.macdHist?.toFixed(3) ?? '—') + '</div>' +
        '<div class="detay-mc-sub">' + (v.macdHist > 0 ? 'Momentum +' : 'Momentum −') + '</div>' +
      '</div>' +
      '<div class="detay-micro-card">' +
        '<div class="detay-mc-label">Stoch RSI K</div>' +
        '<div class="detay-mc-value" style="color:' + stochRenk + '">' + (v.stochRsi ? v.stochRsi.k : '—') + '</div>' +
        '<div class="detay-mc-sub">' + stochSub + '</div>' +
      '</div>';
  } else {
    ozetEl.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:0.8rem;padding:0.5rem">Veri yok — önce güncelle</div>';
  }

  renderDetayTeknik(kod);

  const xu  = piyasaVerisi.xu100;
  const usd = piyasaVerisi.usdtry;
  const xuRenk     = (xu?.degisim ?? 0) >= 0 ? 'var(--accent)' : 'var(--red)';
  const piyasaRenk = (xu?.degisim ?? 0) > 0  ? 'var(--accent)' : (xu?.degisim ?? 0) < -1 ? 'var(--red)' : 'var(--yellow)';
  const xuFiyatStr = xu ? xu.fiyat?.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ' + (xu.degisim >= 0 ? '+' : '') + xu.degisim + '%' : '—';
  const piyasaEtiket = (xu?.degisim ?? 0) > 1 ? '🟢 Yükseliş' : (xu?.degisim ?? 0) < -1 ? '🔴 Düşüş' : '🟡 Yatay';
  const usdStr = usd ? usd.fiyat?.toFixed(2) + ' ₺' : '—';

  el('detayPiyasa').innerHTML =
    '<div style="display:flex;gap:1.5rem;flex-wrap:wrap">' +
      '<div><span style="color:var(--muted)">BIST100:</span> <span style="font-family:var(--mono);color:' + xuRenk + '">' + xuFiyatStr + '</span></div>' +
      '<div><span style="color:var(--muted)">USD/TRY:</span> <span style="font-family:var(--mono)">' + usdStr + '</span></div>' +
      '<div><span style="color:var(--muted)">Piyasa:</span> <span style="color:' + piyasaRenk + '">' + piyasaEtiket + '</span></div>' +
    '</div>';

  const ilgili = haberlerData.filter(h => h.baslik?.includes(kod) || h.baslik?.includes(ad.split(' ')[0]));
  if (ilgili.length > 0) {
    el('detayHaberler').innerHTML = ilgili.slice(0, 3).map(h =>
      '<div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.78rem">' +
        (h.link ? '<a href="' + h.link + '" target="_blank" style="color:var(--text);text-decoration:none">' + h.baslik + '</a>' : h.baslik) +
      '</div>'
    ).join('');
    el('detayHaberlerBlok').style.display = 'block';
  } else {
    el('detayHaberlerBlok').style.display = 'none';
  }

  const pf = portfoy[kod];
  if (pf && v) {
    const kz  = (v.fiyat - pf.alisFiyati) * pf.adet;
    const kzp = ((v.fiyat - pf.alisFiyati) / pf.alisFiyati * 100).toFixed(1);
    el('detayPortfoyBlok').style.display = 'block';
    el('detayPortfoy').innerHTML =
      '<div style="display:flex;gap:1.5rem;flex-wrap:wrap">' +
        '<div><span style="color:var(--muted)">Adet:</span> <span class="mono">' + pf.adet + '</span></div>' +
        '<div><span style="color:var(--muted)">Alış:</span> <span class="mono">' + pf.alisFiyati + ' ₺</span></div>' +
        '<div><span style="color:var(--muted)">K/Z:</span> <span class="mono" style="color:' + (kz >= 0 ? 'var(--accent)' : 'var(--red)') + '">' +
          (kz >= 0 ? '+' : '') + kz.toFixed(0) + ' ₺ (' + kzp + '%)</span></div>' +
      '</div>';
  } else {
    el('detayPortfoyBlok').style.display = 'none';
  }

  el('detayAiIcerik').innerHTML = '<span style="color:var(--muted)">Analiz için butona bas...</span>';
  el('detayAiBtn').disabled     = false;
  el('detayAiBtn').textContent  = '⬡ AI ile Analiz Et';

  const modalBody = document.querySelector('#hisseDetayModal .modal-body');
  if (modalBody) modalBody.scrollTop = 0;
}

export function renderDetayTeknik(kod) {
  const v       = state.veriler[kod];
  const teknikEl = el('detayTeknik');
  if (!v || !teknikEl) return;

  const maRenk  = v.ma20 > v.ma50 ? 'var(--accent)' : 'var(--red)';
  const bolRenk = !v.bollinger ? 'var(--muted)' : v.bollinger.yuzde < 25 ? 'var(--accent)' : v.bollinger.yuzde > 75 ? 'var(--red)' : 'var(--muted)';
  const wRenk   = v.williamsR < -80 ? 'var(--accent)' : v.williamsR > -20 ? 'var(--red)' : 'var(--muted)';
  const mfiRenk = v.mfi < 30 ? 'var(--accent)' : v.mfi > 70 ? 'var(--red)' : 'var(--muted)';
  const hRenk   = v.hacimFark > 0 ? 'var(--accent)' : 'var(--red)';
  const gRenk   = (v.guvenSkoru ?? 0) >= 70 ? 'var(--accent)' : (v.guvenSkoru ?? 0) >= 50 ? 'var(--yellow)' : 'var(--muted)';

  const bolVal = v.bollinger ? v.bollinger.yuzde + '%' : '—';
  const bolSub = v.bollinger?.yuzde < 25 ? 'Alt bant' : v.bollinger?.yuzde > 75 ? 'Üst bant' : 'Orta';
  const wSub   = v.williamsR < -80 ? 'Aşırı Satım' : v.williamsR > -20 ? 'Aşırı Alım' : 'Nötr';
  const mfiSub = v.mfi < 30 ? 'Para çıkışı' : v.mfi > 70 ? 'Para girişi' : 'Dengeli';
  const hVal   = v.hacimFark > 0 ? '+' + v.hacimFark + '%' : v.hacimFark + '%';
  const hSub   = v.hacimFark > 50 ? 'Spike' : 'Normal';

  const mc = (lbl, val, sub, renk) => {
    const st = renk ? ' style="color:' + renk + '"' : '';
    const sb = sub  ? '<div class="mc-sub">' + sub + '</div>' : '';
    return '<div class="micro-card"><div class="mc-label">' + lbl + '</div><div class="mc-value"' + st + '>' + val + '</div>' + sb + '</div>';
  };

  teknikEl.className = 'micro-grid';
  teknikEl.innerHTML =
    mc('Bollinger %', bolVal, bolSub, bolRenk) +
    mc('Williams %R', v.williamsR ?? '—', wSub, wRenk) +
    mc('MFI', v.mfi ?? '—', mfiSub, mfiRenk) +
    mc('MA 20', v.ma20 ? v.ma20.toFixed(2) + ' ₺' : '—', '', '') +
    mc('MA 50', v.ma50 ? v.ma50.toFixed(2) + ' ₺' : '—', '', '') +
    mc('MA Trend', v.ma20 > v.ma50 ? 'Yükseliş' : 'Düşüş', 'MA20/MA50', maRenk) +
    mc('Hacim', hVal, hSub, hRenk) +
    mc('Güven', v.guvenSkoru != null ? v.guvenSkoru + '%' : '—', 'Ağırlıklı', gRenk) +
    (v.pivot   ? mc('Pivot',   v.pivot.pivot + ' ₺', 'R1: ' + v.pivot.r1, '') : '') +
    (v.fib     ? mc('Fib 38%', v.fib.f382 + ' ₺', 'Fib 62%: ' + v.fib.f618 + ' ₺', '') : '') +
    (v.hafta52H ? mc('52H Max', v.hafta52H + ' ₺', 'Poz: ' + v.hafta52Yuzde + '%', 'var(--red)') : '') +
    (v.hafta52L ? mc('52H Min', v.hafta52L + ' ₺', '', 'var(--accent)') : '');
}

// ─────────────────────────────────────────────
// AI ANALİZ SONUCU
// ─────────────────────────────────────────────

export function renderHisseAnalizSonucu(analiz) {
  const aiEl = el('detayAiIcerik');
  if (!aiEl || !analiz) return;

  let veri = null;

  if (analiz.maddeler && Array.isArray(analiz.maddeler)) {
    veri = analiz;
  } else if (analiz.metin) {
    try {
      const temiz  = analiz.metin.replace(/```json|```/g, '').trim();
      const ilkSus = temiz.indexOf('{');
      const parsed = JSON.parse(ilkSus >= 0 ? temiz.slice(ilkSus) : temiz);
      if (parsed.maddeler) veri = { ...parsed, tarih: analiz.tarih, sembol: analiz.sembol };
    } catch (_) {}
  }

  if (!veri) {
    const kaynak = analiz.metin || (typeof analiz === 'string' ? analiz : '');
    if (!kaynak) { aiEl.innerHTML = '<span style="color:var(--muted);font-size:0.8rem">Analiz verisi okunamadı.</span>'; return; }

    const temizlendi = kaynak
      .replace(/^#{1,3}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^---+$/gm, '').replace(/^>\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();

    const satirlar = temizlendi.split(/\n+/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
    const tarihHtml = analiz.tarih
      ? '<div style="font-size:0.63rem;color:var(--muted);font-family:var(--mono);margin-bottom:0.65rem">' + new Date(analiz.tarih).toLocaleString('tr-TR') + '</div>'
      : '';

    aiEl.innerHTML = tarihHtml +
      '<div style="display:flex;flex-direction:column;gap:0.4rem">' +
      satirlar.map(s =>
        '<div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.5rem 0.65rem;border-radius:8px;background:rgba(255,255,255,0.03)">' +
        '<span style="color:var(--accent);flex-shrink:0;margin-top:1px">›</span>' +
        '<span style="font-size:0.81rem;line-height:1.65;color:#b8ddd0">' + s + '</span>' +
        '</div>'
      ).join('') + '</div>';
    return;
  }

  const kararCls = veri.karar === 'AL' ? 'guclu-al' : veri.karar === 'ALMA' ? 'guclu-sat' : 'bekle';
  const riskRenk = veri.risk === 'Düşük' ? 'var(--accent)' : veri.risk === 'Yüksek' ? 'var(--red)' : 'var(--yellow)';

  const chip = (lbl, val, renk) => {
    if (!val || val === 0) return '';
    const st = renk ? ' style="color:' + renk + '"' : '';
    return '<div class="micro-card" style="min-width:80px"><div class="mc-label">' + lbl + '</div><div class="mc-value mono"' + st + '>' + val + ' ₺</div></div>';
  };

  const maddeHTML = (veri.maddeler || []).map(m =>
    '<div style="display:flex;gap:0.6rem;align-items:flex-start;padding:0.5rem 0.65rem;border-radius:8px;background:rgba(255,255,255,0.035);margin-bottom:0.3rem">' +
    '<span style="font-size:0.95rem;line-height:1.5;flex-shrink:0">' + (m.ikon || '•') + '</span>' +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:0.78rem;font-weight:600;color:#e0f0e8;margin-bottom:0.15rem">' + (m.baslik || '') + '</div>' +
    '<div style="font-size:0.76rem;line-height:1.65;color:#9bbfb0">' + (m.aciklama || '') + '</div>' +
    '</div></div>'
  ).join('');

  const tarihStr = veri.tarih ? new Date(veri.tarih).toLocaleString('tr-TR') : '';

  aiEl.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">' +
      '<span class="sinyal-badge ' + kararCls + '" style="font-size:0.88rem;padding:0.35rem 1rem">' + (veri.karar || '—') + '</span>' +
      '<span style="font-size:0.63rem;color:var(--muted);font-family:var(--mono)">' + tarihStr + '</span>' +
    '</div>' +
    (veri.ozet ? '<div style="font-size:0.82rem;line-height:1.6;color:#c8e6d8;padding:0.5rem 0.65rem;border-radius:8px;background:rgba(0,229,160,0.06);border-left:2px solid rgba(0,229,160,0.3);margin-bottom:0.65rem">' + veri.ozet + '</div>' : '') +
    '<div style="margin-bottom:0.65rem">' + maddeHTML + '</div>' +
    '<div class="micro-grid" style="grid-template-columns:repeat(auto-fill,minmax(85px,1fr));margin-bottom:0.5rem">' +
      chip('Destek', veri.destek, '') + chip('Hedef', veri.hedef, 'var(--accent)') + chip('Stop', veri.stopLoss, 'var(--red)') +
      (veri.risk ? '<div class="micro-card"><div class="mc-label">Risk</div><div class="mc-value" style="color:' + riskRenk + '">' + veri.risk + '</div></div>' : '') +
    '</div>' +
    (veri.uyari ? '<div style="font-size:0.72rem;color:var(--muted);line-height:1.55;padding:0.4rem 0.6rem;border-radius:6px;background:rgba(255,209,102,0.06);border-left:2px solid rgba(255,209,102,0.25)">⚠️ ' + veri.uyari + '</div>' : '');
}

// ─────────────────────────────────────────────
// HABERLER
// ─────────────────────────────────────────────

export function renderHaberler() {
  const { haberlerData } = state;
  const listeEl = el('haberListesi');
  const apiVar  = aktifKey();

  if (haberlerData.length === 0) {
    listeEl.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)">Haber bulunamadı</div>';
    return;
  }

  listeEl.innerHTML = haberlerData.map((h, idx) => {
    const tarihStr = h.tarih ? new Date(h.tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const kaynak   = h.kaynak?.includes('dunya') ? 'Dünya' : h.kaynak?.includes('bloomberg') ? 'Bloomberg HT' : h.kaynak?.includes('bbc') ? 'BBC Türkçe' : 'Finans';

    return '<div class="haber-card" id="haber-' + idx + '">' +
      '<div class="haber-baslik">' + (h.link ? '<a href="' + h.link + '" target="_blank" rel="noopener">' + h.baslik + '</a>' : h.baslik) + '</div>' +
      (h.aciklama ? '<div class="haber-aciklama">' + h.aciklama + '...</div>' : '') +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem">' +
        '<div class="haber-meta"><span>📰 ' + kaynak + '</span>' + (tarihStr ? '<span>🕐 ' + tarihStr + '</span>' : '') + '</div>' +
        (apiVar ? '<button class="btn" onclick="window._uiCallbacks?.haberAnalizEt(' + idx + ')" id="analiz-btn-' + idx + '" style="font-size:0.7rem;padding:0.25rem 0.6rem;color:var(--accent);border-color:rgba(0,229,160,0.3)">⬡ AI Analiz</button>' : '') +
      '</div>' +
      '<div id="analiz-' + idx + '"></div>' +
    '</div>';
  }).join('');
}

export function renderHaberAnaliz(idx, analiz) {
  const analizEl = el('analiz-' + idx);
  if (!analizEl || !analiz) return;
  analizEl.innerHTML =
    '<div style="margin-top:0.75rem;padding:0.75rem;background:rgba(0,229,160,0.04);border:1px solid rgba(0,229,160,0.12);border-radius:8px">' +
      '<div style="font-size:0.68rem;color:var(--accent);font-family:var(--mono);margin-bottom:0.5rem">⬡ AI ETKİ ANALİZİ</div>' +
      (analiz.hisseler?.length > 0
        ? '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem">' +
          analiz.hisseler.map(x => {
            const bg  = x.etki === 'olumlu' ? 'rgba(0,229,160,0.12)' : x.etki === 'olumsuz' ? 'rgba(255,69,96,0.12)' : 'rgba(255,209,102,0.12)';
            const br  = x.etki === 'olumlu' ? 'rgba(0,229,160,0.3)'  : x.etki === 'olumsuz' ? 'rgba(255,69,96,0.3)'  : 'rgba(255,209,102,0.3)';
            const ico = x.etki === 'olumlu' ? '🟢' : x.etki === 'olumsuz' ? '🔴' : '🟡';
            return '<div style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:' + bg + ';border:1px solid ' + br + '">' +
              '<span>' + ico + '</span>' +
              '<span style="font-family:var(--mono);font-size:0.72rem;font-weight:500">' + x.kod + '</span>' +
              '<span style="font-size:0.65rem;color:var(--muted)">' + (x.tip === 'direkt' ? 'Doğrudan' : 'Dolaylı') + '</span>' +
              '</div>';
          }).join('') + '</div>'
        : '') +
      '<div style="font-size:0.78rem;color:#b0d8c8;line-height:1.6">' + (analiz.yorum || '') + '</div>' +
      (analiz.sure ? '<div style="font-size:0.68rem;color:var(--muted);margin-top:0.4rem;font-family:var(--mono)">⏱ ' + analiz.sure + '</div>' : '') +
    '</div>';
}

// ─────────────────────────────────────────────
// SÖZLÜK
// ─────────────────────────────────────────────

const TEMEL_TERIMLER = [
  'RSI','MACD','Momentum','Hacim','Hareketli Ortalama','Aşırı Alım','Aşırı Satım',
  'Destek Seviyesi','Direnç Seviyesi','Trend','Volatilite','Piyasa Değeri',
  'Halka Arz','Temettü','F/K Oranı','Teknik Analiz','Temel Analiz',
  'Stop Loss','Take Profit','Portföy Çeşitlendirmesi','Beta','Endeks',
  'Boğa Piyasası','Ayı Piyasası','Konsolidasyon','Breakout',
  'Fibonacci','Bollinger Bandı','Stochastic','EMA','SMA',
  'Hacim Spike','Kurumsal Yatırımcı','Likidite','Spread',
];

export function renderPopularTerimler() {
  const container = el('popularTerimler');
  if (!container || container.childNodes.length > 0) return;
  TEMEL_TERIMLER.forEach(terim => {
    const chip    = document.createElement('button');
    chip.className = 'terim-chip';
    chip.textContent = terim;
    chip.onclick   = () => window._uiCallbacks?.terimSor(terim);
    container.appendChild(chip);
  });
}

export function renderSozluk(sozlukVeriler, filtre = '') {
  const { isAdmin } = state;
  const listeEl  = el('sozlukListesi');
  const filtered = filtre
    ? sozlukVeriler.filter(t => t.terim.toLowerCase().includes(filtre.toLowerCase()))
    : sozlukVeriler;

  if (filtered.length === 0) {
    listeEl.innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--muted)">' +
        '<div style="font-size:2rem;margin-bottom:1rem">📖</div>' +
        '<div style="color:var(--text);margin-bottom:0.5rem">Sözlüğün henüz boş</div>' +
        '<div style="font-size:0.8rem">Yukarıdaki terimlerden birine tıkla, Claude açıklasın</div>' +
      '</div>';
    return;
  }

  listeEl.innerHTML = filtered.map(t =>
    '<div class="terim-card ' + (t.acik ? 'acik' : '') + '" onclick="window._uiCallbacks?.toggleTerim(\'' + t.id + '\')">' +
      '<div class="terim-baslik">' +
        '<span>' + t.terim + '</span>' +
        '<span class="pill al" style="font-size:0.6rem">' + (t.sorulma || 1) + 'x soruldu</span>' +
        (isAdmin ? '<button class="btn primary" onclick="event.stopPropagation();window._uiCallbacks?.pushTerimGonder(\'' + t.id + '\')" style="font-size:0.65rem;padding:2px 8px;margin-left:auto">📢 Push</button>' : '') +
      '</div>' +
      '<div class="terim-aciklama">' + (t.aciklama || '') + '</div>' +
      '<div class="terim-meta">' +
        '<span>📅 ' + (t.tarih ? new Date(t.tarih).toLocaleDateString('tr-TR') : '—') + '</span>' +
        (t.ekleyenAd ? '<span>👤 ' + t.ekleyenAd + '</span>' : '') +
      '</div>' +
    '</div>'
  ).join('');
}

// ─────────────────────────────────────────────
// PUSH BİLDİRİM — 15 saniye gösterim
// ─────────────────────────────────────────────

export function showPushBildirim(baslik, mesaj) {
  const div = document.createElement('div');
  div.style.cssText =
    'position:fixed;top:80px;right:1.5rem;z-index:700;background:var(--bg2);' +
    'border:1px solid rgba(0,229,160,0.3);border-radius:16px;padding:1.25rem;max-width:320px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:modalIn 0.3s ease';
  div.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:0.75rem">' +
      '<div style="font-size:1.5rem">📢</div>' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;font-size:0.85rem;margin-bottom:0.3rem">' + baslik + '</div>' +
        '<div style="font-size:0.78rem;color:var(--muted);line-height:1.5">' + mesaj + '</div>' +
      '</div>' +
      '<button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem">✕</button>' +
    '</div>';
  document.body.appendChild(div);
  setTimeout(() => { if (div.parentElement) div.remove(); }, 15000); // 8sn → 15sn
}

// ─────────────────────────────────────────────
// TAB GEÇİŞİ
// ─────────────────────────────────────────────

export function switchTab(name, buttonEl) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (buttonEl) buttonEl.classList.add('active');
  const target = el('panel-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.mobile-nav-item').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
}

// ─────────────────────────────────────────────
// GLOBAL KÖPRÜ
// ─────────────────────────────────────────────

window._uiCallbacks = {};
window.hisseDetayAc = (kod) => window._uiCallbacks?.hisseDetayAc?.(kod);

// ═══════════════════════════════════════════════
// KAP BİLDİRİMLERİ
// ═══════════════════════════════════════════════

function _kapTipRozeti(tip, tipAciklama) {
  const renkler = { 'FR': 'var(--blue)', 'ODA': 'var(--red)', 'DG': 'var(--muted)' };
  const renk    = renkler[tip] || 'var(--muted)';
  const etiket  = tipAciklama || tip || 'Bildirim';
  return '<span style="font-size:0.68rem;padding:2px 8px;border-radius:4px;background:' + renk + '22;color:' + renk + ';font-weight:600;white-space:nowrap">' + etiket + '</span>';
}

function _kapOnemRozeti(onem) {
  if (onem === 'kritik') return '<span class="sinyal-badge sinyal-guclu-sat" style="font-size:0.65rem">🔴 KRİTİK</span>';
  if (onem === 'onemli') return '<span class="sinyal-badge sinyal-bekle" style="font-size:0.65rem">🟡 ÖNEMLİ</span>';
  return '';
}

function _kapTakipteMi(kodlar) {
  return (kodlar || []).some(k => state.takipEdilen.has(k));
}

function _kapPortfoydeMi(kodlar) {
  return (kodlar || []).some(k => state.portfoy[k]);
}

function _kapTarihFmt(tarihStr) {
  if (!tarihStr) return '—';
  try {
    const d = new Date(tarihStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return tarihStr; }
}

export function renderKapOzetKartlar(bildirimler) {
  const toplam = bildirimler.length;
  const kritik = bildirimler.filter(b => b._onem === 'kritik').length;
  const takip  = bildirimler.filter(b => _kapTakipteMi(b.kodlar)).length;
  const topEl  = el('kapTopToplam');
  const kriEl  = el('kapTopKritik');
  const takEl  = el('kapTopTakip');
  const sonEl  = el('kapSonGuncelleme');
  if (topEl) topEl.textContent = toplam;
  if (kriEl) kriEl.textContent = kritik || '—';
  if (takEl) takEl.textContent = takip  || '—';
  if (sonEl) sonEl.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function renderKapListesi(bildirimler, { filtre = 'tum', sadeceTakip = false, aramaMetni = '' } = {}) {
  const konteyner = el('kapListesi');
  if (!konteyner) return;

  const liste = bildirimler.filter(b => {
    if (filtre !== 'tum' && b.tip !== filtre) return false;
    if (sadeceTakip && !_kapTakipteMi(b.kodlar)) return false;
    if (aramaMetni) {
      const ara = aramaMetni.toLowerCase();
      return (b.sirket?.toLowerCase().includes(ara)) ||
             (b.baslik?.toLowerCase().includes(ara))  ||
             (b.kodlar?.some(k => k.toLowerCase().includes(ara)));
    }
    return true;
  });

  renderKapOzetKartlar(bildirimler);

  if (liste.length === 0) {
    konteyner.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Bildirim bulunamadı</div><div class="empty-sub">Filtre veya arama kriterini değiştir</div></div>';
    return;
  }

  konteyner.innerHTML = liste.map((b, idx) => {
    const portfoyde = _kapPortfoydeMi(b.kodlar);
    const takipte   = _kapTakipteMi(b.kodlar);
    const bgVurgu   = portfoyde ? 'border-left:3px solid var(--accent);' : takipte ? 'border-left:3px solid var(--yellow);' : '';
    const kodBadges = (b.kodlar || []).slice(0, 5).map(k => {
      const renk = state.portfoy[k] ? 'var(--accent)' : state.takipEdilen.has(k) ? 'var(--yellow)' : 'var(--muted)';
      return '<span style="font-size:0.65rem;font-family:var(--mono);padding:1px 6px;border-radius:4px;border:1px solid ' + renk + '44;color:' + renk + '">' + k + '</span>';
    }).join(' ');

    return '<div class="sinyal-satir" style="cursor:pointer;' + bgVurgu + '" onclick="window._uiCallbacks.kapDetayAc(' + idx + ')">' +
      '<div style="display:flex;align-items:flex-start;gap:0.75rem;flex:1;min-width:0">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.3rem">' +
            _kapTipRozeti(b.tip, b.tipAciklama) + _kapOnemRozeti(b._onem) +
            (portfoyde ? '<span style="font-size:0.62rem;color:var(--accent)">● Portföyde</span>' : '') +
            (takipte && !portfoyde ? '<span style="font-size:0.62rem;color:var(--yellow)">● Takipte</span>' : '') +
          '</div>' +
          '<div style="font-weight:600;font-size:0.85rem;margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + b.baslik + '</div>' +
          '<div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.3rem">' + b.sirket + '</div>' +
          '<div style="display:flex;gap:0.3rem;flex-wrap:wrap">' + kodBadges + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;font-size:0.72rem;color:var(--muted);white-space:nowrap">' +
          _kapTarihFmt(b.tarih) +
          (b._analizVar ? '<br><span style="color:var(--accent);font-size:0.65rem">✓ Analiz var</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

export function renderKapDetay(bildirim) {
  if (!bildirim) return;
  const baslikEl = el('kapDetayBaslik');
  const sirketEl = el('kapDetaySirket');
  const metaEl   = el('kapDetayMeta');
  const kodlarEl = el('kapDetayKodlar');
  const kapBtnEl = el('kapDetayKapBtn');

  if (baslikEl) baslikEl.textContent = bildirim.baslik || '—';
  if (sirketEl) sirketEl.textContent = bildirim.sirket || '';

  if (metaEl) {
    metaEl.innerHTML =
      '<div class="micro-kart"><div class="micro-kart-label">Tarih</div><div class="micro-kart-val">' + _kapTarihFmt(bildirim.tarih) + '</div></div>' +
      '<div class="micro-kart"><div class="micro-kart-label">Tür</div><div class="micro-kart-val">' + (bildirim.tipAciklama || bildirim.tip || '—') + '</div></div>' +
      (bildirim.ozet ? '<div class="micro-kart" style="grid-column:1/-1"><div class="micro-kart-label">Özet</div><div class="micro-kart-val" style="font-size:0.8rem;white-space:normal;line-height:1.5">' + bildirim.ozet + '</div></div>' : '');
  }

  if (kodlarEl) {
    const kodlar = bildirim.kodlar || [];
    if (kodlar.length === 0) {
      el('kapDetayKodlarBlok') && (el('kapDetayKodlarBlok').style.display = 'none');
    } else {
      el('kapDetayKodlarBlok') && (el('kapDetayKodlarBlok').style.display = '');
      kodlarEl.innerHTML = kodlar.map(k => {
        const portfoyde = !!state.portfoy[k];
        const takipte   = state.takipEdilen.has(k);
        const renk      = portfoyde ? 'var(--accent)' : takipte ? 'var(--yellow)' : 'var(--muted)';
        const etiket    = portfoyde ? ' ●portföy' : takipte ? ' ●takip' : '';
        return '<span style="font-family:var(--mono);font-size:0.78rem;padding:4px 10px;border-radius:6px;border:1px solid ' + renk + '55;color:' + renk + '">' + k + etiket + '</span>';
      }).join('');
    }
  }

  if (kapBtnEl && bildirim.url) {
    kapBtnEl.onclick        = () => window.open(bildirim.url, '_blank');
    kapBtnEl.style.display  = '';
  } else if (kapBtnEl) {
    kapBtnEl.style.display = 'none';
  }

  const aiEl = el('kapDetayAiIcerik');
  if (aiEl) aiEl.innerHTML = 'Bu bildirimin portföyünüze ve takip listenize etkisini öğrenmek için analiz et.';
}

export function renderKapAnalizSonucu(analiz) {
  const aiEl = el('kapDetayAiIcerik');
  if (!aiEl || !analiz) return;

  const onemRenk   = analiz.onem === 'kritik' ? 'var(--red)' : analiz.onem === 'onemli' ? 'var(--yellow)' : 'var(--accent)';
  const hisseSatir = (analiz.hisseler || []).map(h => {
    const etkiRenk = h.etki === 'olumlu' ? 'var(--accent)' : h.etki === 'olumsuz' ? 'var(--red)' : 'var(--muted)';
    const etkiIcon = h.etki === 'olumlu' ? '▲' : h.etki === 'olumsuz' ? '▼' : '→';
    return '<div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-family:var(--mono);font-size:0.75rem;min-width:50px;color:' + etkiRenk + '">' + h.kod + '</span>' +
      '<span style="color:' + etkiRenk + ';font-size:0.75rem;min-width:20px">' + etkiIcon + '</span>' +
      '<span style="font-size:0.78rem;color:var(--muted)">' + (h.aciklama || '') + '</span>' +
    '</div>';
  }).join('');

  aiEl.innerHTML =
    '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">' +
      '<span style="font-size:0.72rem;font-weight:700;color:' + onemRenk + ';text-transform:uppercase;letter-spacing:0.06em">' +
        (analiz.onem === 'kritik' ? '🔴 KRİTİK' : analiz.onem === 'onemli' ? '🟡 ÖNEMLİ' : '🟢 NORMAL') +
      '</span>' +
    '</div>' +
    '<div style="font-size:0.85rem;line-height:1.7;margin-bottom:0.75rem">' + (analiz.yorum || '') + '</div>' +
    (hisseSatir ? '<div style="font-size:0.72rem;color:var(--muted);margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.06em">ETKİLENEN HİSSELER</div>' + hisseSatir : '');
}

// ═══════════════════════════════════════════════
// GRAFİK — Canvas tabanlı fiyat grafiği
// ═══════════════════════════════════════════════

export function renderGrafik(kod, gun = 30) {
  const v      = state.veriler[kod];
  const canvas = el('grafikCanvas');
  const wrap   = el('grafikWrap');

  if (!canvas || !v?.kapanis?.length) {
    if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted);font-size:0.82rem">Grafik verisi yok — önce Güncelle\'ye bas</div>';
    return;
  }

  const veri = v.kapanis.slice(-Math.min(gun, v.kapanis.length));
  if (veri.length < 2) return;

  const W = Math.max(canvas.offsetWidth || canvas.parentElement?.offsetWidth || 560, 280);
  const H = 260;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, W, H);

  const pad = { top: 24, right: 18, bottom: 34, left: 56 };
  const cW  = W - pad.left - pad.right;
  const cH  = H - pad.top  - pad.bottom;
  const min = Math.min(...veri) * 0.995;
  const max = Math.max(...veri) * 1.005;
  const rng = max - min || 1;
  const xOf = i   => pad.left + (i / (veri.length - 1)) * cW;
  const yOf = val => pad.top  + (1 - (val - min) / rng) * cH;

  const cs       = getComputedStyle(document.documentElement);
  const clrMuted = cs.getPropertyValue('--muted').trim()  || '#616478';
  const clrBrd   = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';

  // Izgara
  ctx.strokeStyle = clrBrd;
  ctx.lineWidth   = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y   = pad.top + (i / 5) * cH;
    const val = max - (i / 5) * rng;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = clrMuted; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(2), pad.left - 5, y + 3);
  }

  // X ekseni etiketleri
  const nEtiket = Math.min(6, veri.length);
  ctx.fillStyle = clrMuted; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'center';
  for (let i = 0; i < nEtiket; i++) {
    const idx    = Math.round(i * (veri.length - 1) / (nEtiket - 1));
    const kalanG = veri.length - 1 - idx;
    ctx.fillText(kalanG === 0 ? 'bugün' : '-' + kalanG + 'g', xOf(idx), H - pad.bottom + 14);
  }

  // MA20
  if (veri.length >= 20) {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,209,102,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (let i = 19; i < veri.length; i++) {
      const ma = veri.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
      i === 19 ? ctx.moveTo(xOf(i), yOf(ma)) : ctx.lineTo(xOf(i), yOf(ma));
    }
    ctx.stroke(); ctx.setLineDash([]);
    const ma20Son = veri.slice(-20).reduce((a, b) => a + b, 0) / 20;
    ctx.fillStyle = 'rgba(255,209,102,0.7)'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText('MA20 ' + ma20Son.toFixed(1), pad.left + 2, yOf(ma20Son) - 4);
  }

  // Fiyat çizgisi + gradient
  const sonFiyat = veri.at(-1);
  const ilkFiyat = veri[0];
  const pozitif  = sonFiyat >= ilkFiyat;
  const anaRenk  = pozitif ? '#00e5a0' : '#ff4560';
  const renk2    = pozitif ? 'rgba(0,229,160,0.18)' : 'rgba(255,69,96,0.18)';

  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, renk2); grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(veri[0]));
  veri.forEach((val, i) => ctx.lineTo(xOf(i), yOf(val)));
  ctx.lineTo(xOf(veri.length - 1), H - pad.bottom); ctx.lineTo(xOf(0), H - pad.bottom);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = anaRenk; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.moveTo(xOf(0), yOf(veri[0]));
  veri.forEach((val, i) => ctx.lineTo(xOf(i), yOf(val)));
  ctx.stroke();

  const sonX = xOf(veri.length - 1);
  const sonY = yOf(sonFiyat);
  ctx.beginPath(); ctx.arc(sonX, sonY, 4, 0, Math.PI * 2); ctx.fillStyle = anaRenk; ctx.fill();
  ctx.beginPath(); ctx.arc(sonX, sonY, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

  const degPct  = +((sonFiyat - ilkFiyat) / ilkFiyat * 100).toFixed(2);
  ctx.fillStyle = anaRenk; ctx.font = 'bold 12px JetBrains Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText((degPct >= 0 ? '▲ +' : '▼ ') + degPct + '%', pad.left + 4, pad.top + 15);
  ctx.font = 'bold 11px JetBrains Mono, monospace'; ctx.textAlign = 'right';
  ctx.fillText(sonFiyat.toFixed(2) + ' ₺', W - pad.right, Math.max(pad.top + 15, Math.min(sonY - 8, H - pad.bottom - 6)));
}

// ═══════════════════════════════════════════════
// ANALİZ ARŞİVİ — Liste render
// ═══════════════════════════════════════════════

export function renderAnalizGecmisi(analizler) {
  const konteyner = el('analizGecmisiListesi');
  if (!konteyner) return;

  if (!analizler?.length) {
    konteyner.innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--muted)">' +
        '<div style="font-size:2rem;margin-bottom:1rem">📋</div>' +
        '<div>Henüz analiz geçmişi yok</div>' +
        '<div style="font-size:0.78rem;margin-top:0.5rem">Hisse detayından AI analizi yaptığında buraya kaydedilir</div>' +
      '</div>';
    return;
  }

  // Tutarlılık istatistikleri
  const degerlendirilmis = analizler.filter(a => a.dogrulandi !== null);
  const dogru   = degerlendirilmis.filter(a => a.dogrulandi === true).length;
  const toplam  = degerlendirilmis.length;
  const isabet  = toplam > 0 ? Math.round(dogru / toplam * 100) : null;
  const isabetRenk = isabet >= 60 ? 'var(--accent)' : isabet >= 40 ? 'var(--yellow)' : 'var(--red)';

  const istatHTML = toplam > 0
    ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:1rem">' +
        '<div class="card" style="text-align:center;padding:0.75rem"><div style="font-size:0.65rem;color:var(--muted)">Değerlendirilen</div><div style="font-size:1.2rem;font-family:var(--mono)">' + toplam + '</div></div>' +
        '<div class="card" style="text-align:center;padding:0.75rem"><div style="font-size:0.65rem;color:var(--muted)">Tutarlı</div><div style="font-size:1.2rem;font-family:var(--mono);color:var(--accent)">' + dogru + '</div></div>' +
        '<div class="card" style="text-align:center;padding:0.75rem"><div style="font-size:0.65rem;color:var(--muted)">AI İsabeti</div><div style="font-size:1.2rem;font-family:var(--mono);color:' + isabetRenk + '">%' + isabet + '</div></div>' +
      '</div>'
    : '';

  const satirlar = analizler.map(a => {
    const tarih    = new Date(a.tarih).toLocaleDateString('tr-TR');
    const saat     = new Date(a.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const kararCls = ['AL', 'GÜÇLÜ AL'].includes(a.karar) ? 'al' : ['ALMA', 'GÜÇLÜ SAT'].includes(a.karar) ? 'sat' : 'bekle';
    const sonucPill = a.dogrulandi === null
      ? '<span class="pill bekle" style="font-size:0.6rem">⏳ Bekleniyor</span>'
      : a.dogrulandi
        ? '<span class="pill al" style="font-size:0.6rem">✓ Tutarlı</span>'
        : '<span class="pill sat" style="font-size:0.6rem">✗ Tutarsız</span>';
    const sonucYuzde = a.sonucYuzde !== null && a.sonucYuzde !== undefined
      ? '<span class="mono" style="font-size:0.72rem;color:' + (a.sonucYuzde >= 0 ? 'var(--accent)' : 'var(--red)') + '">' + (a.sonucYuzde >= 0 ? '+' : '') + a.sonucYuzde + '%</span>'
      : '';

    const fiyatlarHTML = (a.hedef || a.destek || a.stopLoss)
      ? '<div style="display:flex;gap:0.75rem;margin-top:0.35rem;font-size:0.7rem;font-family:var(--mono)">' +
          (a.destek    ? '<span style="color:var(--accent)">▲ ' + a.destek + '₺</span>' : '') +
          (a.hedef     ? '<span style="color:var(--accent)">🎯 ' + a.hedef + '₺</span>' : '') +
          (a.stopLoss  ? '<span style="color:var(--red)">⛔ ' + a.stopLoss + '₺</span>' : '') +
          (a.fiyatAninda ? '<span style="color:var(--muted)">Giriş: ' + a.fiyatAninda + '₺</span>' : '') +
          (a.sonucFiyat  ? '<span style="color:var(--text)">Şimdi: ' + a.sonucFiyat + '₺</span>' : '') +
        '</div>'
      : '';

    return '<div class="sinyal-satir">' +
      '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
        '<span class="mono" style="font-weight:600;font-size:0.85rem">' + a.sembol + '</span>' +
        (a.karar ? '<span class="pill ' + kararCls + '" style="font-size:0.65rem">' + a.karar + '</span>' : '') +
        sonucPill + ' ' + sonucYuzde +
        '<span style="font-size:0.68rem;color:var(--muted);margin-left:auto">' + tarih + ' ' + saat + '</span>' +
      '</div>' +
      (a.ozet ? '<div style="font-size:0.76rem;color:var(--muted);margin-top:0.3rem;line-height:1.5">' + a.ozet + '</div>' : '') +
      fiyatlarHTML +
    '</div>';
  }).join('');

  konteyner.innerHTML = istatHTML + satirlar;
}

// ═══════════════════════════════════════════════
// BİLDİRİM MERKEZİ — Push mesajlar listesi
// ═══════════════════════════════════════════════

export function renderPushMesajlari(mesajlar) {
  const konteyner = el('pushMesajListesi');
  if (!konteyner) return;

  const guncelMesajlar = (mesajlar || []).filter(m => Date.now() - m.tarih < 24 * 60 * 60 * 1000);

  if (!guncelMesajlar.length) {
    konteyner.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:0.82rem">Son 24 saatte bildirim yok</div>';
    return;
  }

  konteyner.innerHTML = guncelMesajlar.map(m => {
    const tarih = new Date(m.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return '<div style="padding:0.875rem;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem">' +
        '<div style="font-weight:600;font-size:0.84rem">' + m.baslik + '</div>' +
        '<span style="font-size:0.65rem;color:var(--muted);font-family:var(--mono)">' + tarih + '</span>' +
      '</div>' +
      '<div style="font-size:0.78rem;color:var(--muted);line-height:1.5">' + m.mesaj + '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════
// GÜN SONU ÖZETLERİ — Arşiv listesi
// ═══════════════════════════════════════════════

export function renderGunSonuOzetleri(ozetler) {
  const konteyner = el('gunSonuOzetListesi');
  if (!konteyner) return;

  if (!ozetler?.length) {
    konteyner.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:0.82rem">Henüz gün sonu özeti yok</div>';
    return;
  }

  konteyner.innerHTML = ozetler.map(o => {
    const tarih = new Date(o.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    return '<div style="padding:0.875rem;border-bottom:1px solid var(--border)">' +
      '<div style="font-size:0.65rem;color:var(--accent);font-family:var(--mono);margin-bottom:0.4rem">📊 ' + tarih + '</div>' +
      '<div style="font-size:0.8rem;line-height:1.65;color:var(--text)">' + o.metin + '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════
// PDF İNDİR — jsPDF tabanlı, tarayıcı içi
// ═══════════════════════════════════════════════

export function analizArsiviPdfOlustur(analizler, kullaniciAd = '') {
  if (!analizler?.length) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Renk paleti
  const KOYU    = [15,  17,  26];
  const ORTA    = [24,  27,  40];
  const ACIK    = [38,  43,  62];
  const YESIL   = [0,   229, 160];
  const KIRMIZI = [255, 69,  96];
  const SARI    = [255, 209, 102];
  const BEYAZ   = [255, 255, 255];
  const GRI     = [120, 130, 160];
  const AGIK_G  = [180, 190, 220];

  const W = 210; const H = 297; const M = 14;

  // İstatistikler
  const degerlendirilmis = analizler.filter(a => a.dogrulandi !== null);
  const dogru   = degerlendirilmis.filter(a => a.dogrulandi === true).length;
  const yanlis  = degerlendirilmis.filter(a => a.dogrulandi === false).length;
  const toplam  = degerlendirilmis.length;
  const isabet  = toplam > 0 ? Math.round(dogru / toplam * 100) : null;

  // ── KAPAK ─────────────────────────────────
  doc.setFillColor(...KOYU); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...YESIL); doc.rect(0, 0, W, 2, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...YESIL);
  doc.text('HisseMATIK', M, 40);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRI);
  doc.text('BIST Teknik Analiz Platformu', M, 49);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...BEYAZ);
  doc.text('AI Analiz Raporu', M, 72);
  doc.setDrawColor(...YESIL); doc.setLineWidth(0.5); doc.line(M, 76, W - M, 76);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRI);
  const simdi = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text('Olusturma tarihi: ' + simdi, M, 84);
  if (kullaniciAd) doc.text('Kullanici: ' + kullaniciAd, M, 91);

  // İstatistik kartları
  const kartlar = [
    { baslik: 'Toplam Analiz',   deger: String(analizler.length), renk: YESIL   },
    { baslik: 'Degerlendirilen', deger: String(toplam),           renk: SARI    },
    { baslik: 'Tutarli',         deger: String(dogru),            renk: YESIL   },
    { baslik: 'Tutarsiz',        deger: String(yanlis),           renk: KIRMIZI },
  ];
  const kartY = 110; const kartW = 50; const kartAra = 8;
  kartlar.forEach((k, i) => {
    const x = M + i * (kartW + kartAra);
    doc.setFillColor(...ORTA); doc.roundedRect(x, kartY, kartW, 28, 3, 3, 'F');
    doc.setDrawColor(...k.renk); doc.setLineWidth(0.3); doc.roundedRect(x, kartY, kartW, 28, 3, 3, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...k.renk);
    doc.text(k.deger, x + kartW / 2, kartY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRI);
    doc.text(k.baslik, x + kartW / 2, kartY + 23, { align: 'center' });
  });

  if (isabet !== null) {
    const skorRenk = isabet >= 60 ? YESIL : isabet >= 40 ? SARI : KIRMIZI;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(48); doc.setTextColor(...skorRenk);
    doc.text('%' + isabet, W / 2, 185, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(...GRI);
    doc.text('AI Karar isabeti', W / 2, 194, { align: 'center' });
    const aciklama = isabet >= 70
      ? 'Mukemmel performans — AI analizleri yuksek tutarlilik gosteriyor'
      : isabet >= 50 ? 'Orta duzey tutarlilik — piyasa kosullari degiskenlik gosteriyor'
      : 'Dusuk tutarlilik — analizleri referans olarak kullanin, tek basina karar vermeyin';
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(aciklama, W - M * 2), W / 2, 202, { align: 'center' });
  }

  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...GRI);
  doc.text(doc.splitTextToSize('Bu rapor teknik analiz amaclidir. Yatirim tavsiyesi niteliginde degildir.', W - M * 2), W / 2, H - 16, { align: 'center' });

  // ── HİSSE SAYFALARI ───────────────────────
  const gruplar = {};
  analizler.forEach(a => {
    if (!gruplar[a.sembol]) gruplar[a.sembol] = [];
    gruplar[a.sembol].push(a);
  });

  Object.entries(gruplar).forEach(([sembol, sembolAnalizler]) => {
    doc.addPage();
    doc.setFillColor(...KOYU); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...ORTA); doc.rect(0, 0, W, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...YESIL);
    doc.text(sembol, M, 12);
    doc.setFontSize(8); doc.setTextColor(...GRI);
    doc.text('HisseMATIK Analiz Raporu', W - M, 12, { align: 'right' });

    let y = 26;

    sembolAnalizler.forEach((analiz) => {
      if (y > H - 50) {
        doc.addPage();
        doc.setFillColor(...KOYU); doc.rect(0, 0, W, H, 'F');
        doc.setFillColor(...ORTA); doc.rect(0, 0, W, 18, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...YESIL);
        doc.text(sembol + ' (devam)', M, 12);
        y = 26;
      }

      doc.setFillColor(...ORTA); doc.roundedRect(M, y, W - M * 2, 6, 1.5, 1.5, 'F');
      const tarih = new Date(analiz.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...AGIK_G);
      doc.text(tarih, M + 3, y + 4.2);

      if (analiz.karar) {
        const kararRenk = ['AL', 'GUCLU AL'].includes(analiz.karar) ? YESIL : ['ALMA', 'GUCLU SAT'].includes(analiz.karar) ? KIRMIZI : SARI;
        const kararX    = W - M - 3 - doc.getTextWidth(analiz.karar) - 6;
        doc.setFillColor(...kararRenk); doc.roundedRect(kararX, y + 1, doc.getTextWidth(analiz.karar) + 6, 4, 1, 1, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...KOYU);
        doc.text(analiz.karar, kararX + 3, y + 4);
      }

      if (analiz.dogrulandi !== null) {
        const tutRenk  = analiz.dogrulandi ? YESIL : KIRMIZI;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...tutRenk);
        doc.text(analiz.dogrulandi ? 'Tutarli' : 'Tutarsiz', W - M - 40, y + 4);
      }

      y += 8;

      const seviyeler = [];
      if (analiz.fiyatAninda) seviyeler.push('Giris: ' + analiz.fiyatAninda + ' TL');
      if (analiz.destek)      seviyeler.push('Destek: ' + analiz.destek + ' TL');
      if (analiz.hedef)       seviyeler.push('Hedef: ' + analiz.hedef + ' TL');
      if (analiz.stopLoss)    seviyeler.push('Stop: ' + analiz.stopLoss + ' TL');
      if (analiz.sonucFiyat)  seviyeler.push('Sonuc: ' + analiz.sonucFiyat + ' TL');
      if (analiz.sonucYuzde != null) seviyeler.push('Getiri: ' + (analiz.sonucYuzde >= 0 ? '+' : '') + analiz.sonucYuzde + '%');

      if (seviyeler.length > 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SARI);
        doc.text(seviyeler.join('   |   '), M + 3, y);
        y += 5;
      }

      const kaynakMetin = (analiz.ozet || analiz.metin || '')
        .replace(/#{1,3}\s+/g, '').replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*/g, '').replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);

      if (kaynakMetin) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...AGIK_G);
        doc.splitTextToSize(kaynakMetin, W - M * 2 - 6).slice(0, 8).forEach(satir => {
          doc.text(satir, M + 3, y); y += 4.5;
        });
      }

      doc.setDrawColor(...ACIK); doc.setLineWidth(0.2); doc.line(M, y + 1, W - M, y + 1);
      y += 6;
    });
  });

  // ── ÖZET TABLO ────────────────────────────
  doc.addPage();
  doc.setFillColor(...KOYU); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...ORTA); doc.rect(0, 0, W, 18, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...YESIL);
  doc.text('Tum Analizler - Ozet Tablo', M, 12);

  const kolonX = [M, M+28, M+52, M+72, M+94, M+116, M+136, M+156];
  const kolonlar = ['Tarih', 'Hisse', 'Karar', 'Giris', 'Hedef', 'Sonuc', 'Getiri', 'Tutarli'];
  let ty = 26;

  doc.setFillColor(...ACIK); doc.rect(M, ty - 4, W - M * 2, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRI);
  kolonlar.forEach((k, i) => doc.text(k, kolonX[i], ty));
  ty += 4;

  analizler.slice(0, 40).forEach((a, i) => {
    if (ty > H - 20) return;
    if (i % 2 === 0) { doc.setFillColor(24, 27, 40); doc.rect(M, ty - 3.5, W - M * 2, 5.5, 'F'); }

    const tarih2     = new Date(a.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const kararRenk  = ['AL', 'GUCLU AL'].includes(a.karar) ? YESIL : ['ALMA', 'GUCLU SAT'].includes(a.karar) ? KIRMIZI : SARI;
    const tutRenk    = a.dogrulandi === true ? YESIL : a.dogrulandi === false ? KIRMIZI : GRI;
    const getiriStr  = a.sonucYuzde != null ? (a.sonucYuzde >= 0 ? '+' : '') + a.sonucYuzde + '%' : '—';
    const getiriRenk = a.sonucYuzde > 0 ? YESIL : a.sonucYuzde < 0 ? KIRMIZI : GRI;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(...AGIK_G); doc.text(tarih2, kolonX[0], ty); doc.text(a.sembol, kolonX[1], ty);
    doc.setTextColor(...kararRenk); doc.text(a.karar || '—', kolonX[2], ty);
    doc.setTextColor(...AGIK_G);
    doc.text(a.fiyatAninda ? String(a.fiyatAninda) : '—', kolonX[3], ty);
    doc.text(a.hedef       ? String(a.hedef)       : '—', kolonX[4], ty);
    doc.text(a.sonucFiyat  ? String(a.sonucFiyat)  : '—', kolonX[5], ty);
    doc.setTextColor(...getiriRenk); doc.text(getiriStr, kolonX[6], ty);
    doc.setTextColor(...tutRenk); doc.text(a.dogrulandi === true ? 'E' : a.dogrulandi === false ? 'H' : '—', kolonX[7], ty);
    ty += 5.5;
  });

  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...GRI);
  doc.text('Bu rapor yatirim tavsiyesi degildir. HisseMATIK', W / 2, H - 10, { align: 'center' });

  const dosyaAdi = 'HisseMATIK_Analiz_Raporu_' + new Date().toISOString().split('T')[0] + '.pdf';
  doc.save(dosyaAdi);
}