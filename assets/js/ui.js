// ══════════════════════════════════════════════
// HisseMatik — UI Katmanı
// assets/js/ui.js
//
// Tek sorumluluk: state'i okuyup DOM'a basmak.
// Hiçbir network çağrısı, hiçbir iş mantığı yok.
// Her fonksiyon state'ten okur, DOM'u günceller.
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
  el('statusDot').className  = 'status-dot ' + type;
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

  el('userName').textContent  = (currentUser.displayName || currentUser.email).split(' ')[0];
  el('userAvatar').textContent = (currentUser.displayName || currentUser.email)[0].toUpperCase();

  if (isAdmin) {
    el('adminBadge').style.display = 'inline';
    document.querySelectorAll('.admin-only').forEach(e => e.style.display = 'block');
  }
}

// ─────────────────────────────────────────────
// PİYASA KARTLARI (BIST100 / USD / EUR)
// ─────────────────────────────────────────────

function _piyasaYonBilgi(deg) {
  if (deg >= 1.5)  return { etiket: 'Güçlü Yükseliş', cls: 'yukselis', aciklama: 'AL sinyalleri güçlü' };
  if (deg >= 0)    return { etiket: 'Yatay / Hafif +', cls: 'yatay',    aciklama: 'Seçici alım yapılabilir' };
  if (deg >= -1.5) return { etiket: 'Hafif Düşüş',    cls: 'yatay',    aciklama: 'AL sinyallerine dikkat' };
  return             { etiket: 'Güçlü Düşüş',    cls: 'dusus',    aciklama: 'SAT baskısı var' };
}

// ══════════════════════════════════════════════
// PATCH: ui.js — renderPiyasaKartlari
//
// Eski renderPiyasaKartlari ve renderPiyasaYonu
// fonksiyonlarını BU KODLA DEĞİŞTİR.
//
// Yeni özellikler:
//  • BIST 100 + piyasa yön etiketi
//  • BIST 30
//  • USD/TRY  |  EUR/TRY  |  EUR/USD
//  • ALTIN gram / çeyrek / tam (TL)
//  • Kayan (marquee) animasyonu — tüm sayfalarda
// ══════════════════════════════════════════════

// ─────────────────────────────────────────────
// Yardımcı: para formatı
// ─────────────────────────────────────────────
function _fmt(sayi, ondalik = 2) {
  if (!sayi && sayi !== 0) return '—';
  return sayi.toLocaleString('tr-TR', {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });
}

// ─────────────────────────────────────────────
// Piyasa yönü metni (BIST 100 için)
// ─────────────────────────────────────────────
function _piyasaYonBilgi(deg) {
  if (deg >= 1.5)  return { etiket: 'Güçlü Yükseliş', cls: 'yukselis' };
  if (deg >= 0)    return { etiket: 'Yatay / +',       cls: 'yatay'    };
  if (deg >= -1.5) return { etiket: 'Hafif Düşüş',     cls: 'yatay'    };
  return             { etiket: 'Güçlü Düşüş',     cls: 'dusus'    };
}

// ─────────────────────────────────────────────
// Tek bir ticker öğesi oluştur
// ─────────────────────────────────────────────
function _tickerItem(label, deger, degisim, tersCls = false, ek = '') {
  if (!deger) return '';
  const d      = parseFloat(degisim) || 0;
  const artis  = tersCls ? (d < 0) : (d >= 0);   // tersCls: kur yükselince kötü
  const cls    = artis ? 'pos' : 'neg';
  const isaret = d >= 0 ? '+' : '';
  return `<div class="ticker-item">
    <span class="ticker-label">${label}</span>
    <span class="ticker-value">${deger}</span>
    <span class="ticker-change ${cls}">${isaret}${d}%</span>
    ${ek}
  </div>`;
}

// ─────────────────────────────────────────────
// Ana render fonksiyonu
// ─────────────────────────────────────────────
export function renderPiyasaKartlari() {
  const { xu100, xu030, usdtry, eurtry, eurusd, altin } = state.piyasaVerisi;

  // ── BIST 100 (yön etiketli) ───────────────
  const bist100Html = xu100 ? (() => {
    const { etiket, cls } = _piyasaYonBilgi(xu100.degisim);
    const d = xu100.degisim || 0;
    const artis = d >= 0;
    return `<div class="ticker-item">
      <span class="ticker-label">BIST 100</span>
      <span class="ticker-value">${_fmt(xu100.fiyat, 0)}</span>
      <span class="ticker-change ${artis ? 'pos' : 'neg'}">${artis ? '+' : ''}${d}%</span>
      <span class="ticker-yon ${cls}">${etiket}</span>
    </div>`;
  })() : '';

  // ── BIST 30 ───────────────────────────────
  const bist30Html = _tickerItem(
    'BIST 30',
    xu030 ? _fmt(xu030.fiyat, 0) : null,
    xu030?.degisim,
  );

  // ── Döviz ─────────────────────────────────
  const usdHtml  = _tickerItem('USD/TRY',  usdtry ? _fmt(usdtry.fiyat) + ' ₺' : null, usdtry?.degisim, true);
  const eurHtml  = _tickerItem('EUR/TRY',  eurtry ? _fmt(eurtry.fiyat) + ' ₺' : null, eurtry?.degisim, true);
  const euusdHtml = _tickerItem('EUR/USD', eurusd ? _fmt(eurusd.fiyat, 4)        : null, eurusd?.degisim);

  // ── Altın ─────────────────────────────────
  let altinHtml = '';
  if (altin) {
    const d   = altin.degisim || 0;
    const cls = d >= 0 ? 'pos' : 'neg';
    const isk = d >= 0 ? '+' : '';

    if (altin.gramTL) {
      altinHtml += `<div class="ticker-item">
        <span class="ticker-label">ALTIN GR</span>
        <span class="ticker-value">${_fmt(altin.gramTL)} ₺</span>
        <span class="ticker-change ${cls}">${isk}${d}%</span>
      </div>`;
    }
    if (altin.ceyrekTL) {
      altinHtml += `<div class="ticker-item">
        <span class="ticker-label">ÇEYREK</span>
        <span class="ticker-value">${_fmt(altin.ceyrekTL, 0)} ₺</span>
        <span class="ticker-change ${cls}">${isk}${d}%</span>
      </div>`;
    }
    if (altin.tamTL) {
      altinHtml += `<div class="ticker-item">
        <span class="ticker-label">TAM ALTIN</span>
        <span class="ticker-value">${_fmt(altin.tamTL, 0)} ₺</span>
        <span class="ticker-change ${cls}">${isk}${d}%</span>
      </div>`;
    }
  }

  // ── İçerik birleştir ─────────────────────
  const icerik = bist100Html + bist30Html + usdHtml + eurHtml + euusdHtml + altinHtml;

  // Her ticker-bar'ı güncelle (dashboard + diğer paneller)
  document.querySelectorAll('.ticker-bar').forEach(container => {
    // Kayan animasyon: inner wrapper ile
    container.innerHTML = `
      <div class="ticker-track">
        <div class="ticker-inner">${icerik}</div>
        <div class="ticker-inner" aria-hidden="true">${icerik}</div>
      </div>`;
  });
}

// Alias — geriye dönük uyumluluk
export function renderPiyasaYonu() {
  renderPiyasaKartlari();
}
// ─────────────────────────────────────────────
// ÖZET KARTLAR (takip, güçlü al/sat, isabet)
// ─────────────────────────────────────────────

export function renderSummary() {
  const { veriler, takipEdilen } = state;
  const { dogru, yanlis, toplam, isabet } = sinyalIstatistik();

  const sumAl  = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ AL').length;
  const sumSat = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ SAT').length;

  const summaryCards = el('summaryCards');
  if (summaryCards) {
    summaryCards.className = 'summary-grid';
    summaryCards.innerHTML = `
      <div class="summary-card">
        <div class="sc-label">Takip Edilen</div>
        <div class="sc-value">${takipEdilen.size}</div>
      </div>
      <div class="summary-card s-green">
        <div class="sc-label">Güçlü AL</div>
        <div class="sc-value green">${sumAl || '—'}</div>
      </div>
      <div class="summary-card s-red">
        <div class="sc-label">Güçlü SAT</div>
        <div class="sc-value red">${sumSat || '—'}</div>
      </div>
      <div class="summary-card s-yellow">
        <div class="sc-label">Sinyal İsabeti</div>
        <div class="sc-value yellow">${toplam > 0 ? '%' + isabet : '—'}</div>
      </div>`;
  } else {
    el('sumTakip')  && (el('sumTakip').textContent  = takipEdilen.size);
    el('sumAl')     && (el('sumAl').textContent     = sumAl  || '—');
    el('sumSat')    && (el('sumSat').textContent     = sumSat || '—');
    el('sumIsabet') && (el('sumIsabet').textContent  = toplam > 0 ? '%' + isabet : '—');
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
      `<tr><td colspan='9' class='empty-state' style='padding:3rem'>Henüz veri yok — Hisseler sekmesinden hisse seç, ardından Güncelle düğmesine bas.</td></tr>`;
    return;
  }

  const lastSinyal = sinyalGecmisi[0];
  const aiBox = el('aiBoxContainer');
  if (aiBox && lastSinyal?.aiYorum) {
    aiBox.innerHTML = `<div class="ai-glass">
      <div class="ai-glass-header">
        <div class="ai-glass-icon">⬡</div>
        <span class="ai-glass-title">Claude AI Portföy Analizi</span>
        <span class="ai-glass-time">${new Date(lastSinyal.tarih).toLocaleString('tr-TR')}</span>
      </div>
      <div class="ai-glass-content">${lastSinyal.aiYorum}</div>
    </div>`;
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
        ? `<span class="pos">+${v.hacimFark}%</span>`
        : v.hacimFark < 0 ? `<span class="neg">${v.hacimFark}%</span>` : '<span class="muted">—</span>';

      const macdRenk  = v.macdHist > 0 ? 'var(--accent)' : 'var(--red)';
      const bolRenk   = v.bollinger?.yuzde < 25 ? 'var(--accent)'
                      : v.bollinger?.yuzde > 75 ? 'var(--red)' : 'var(--muted)';
      const degIsaret = v.degisim >= 0 ? '+' : '';

      return `<tr>
        <td>
          <span class='mono' style='font-weight:600;cursor:pointer;color:var(--accent)'
            onclick='hisseDetayAc("${k}")'>${k}</span>
        </td>
        <td class='mono' style='font-weight:500'>${v.fiyat ?? '—'} ₺</td>
        <td class='mono ${degCls}'>${degIsaret}${v.degisim}%</td>
        <td>
          <div class='rsi-wrap'>
            <div class='rsi-bar'><div class='rsi-fill' style='width:${rsiPct}%;background:${rsiColor}'></div></div>
            <span class='mono' style='font-size:0.75rem;color:${rsiColor};min-width:28px'>${v.rsi}</span>
          </div>
        </td>
        <td><span class='sinyal-badge ${cls}'>${v.sinyal}</span></td>
        <td>
          <div class='guven-wrap'>
            <div class='guven-bar'><div class='guven-fill ${guvenCls}' style='width:${guven}%'></div></div>
            <span class='guven-pct'>${guvenStr}</span>
          </div>
        </td>
        <td class='mono' style='font-size:0.72rem;color:${macdRenk}'>
          ${v.macdHist?.toFixed(3) ?? '—'}
        </td>
        <td>${hacimTxt}</td>
        <td class='mono' style='font-size:0.72rem;color:${bolRenk}'>
          ${v.bollinger ? v.bollinger.yuzde + '%' : '—'}
        </td>
      </tr>`;
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
  const _ekstra = Object.keys(veriler).filter(k => !_bistKodlar.has(k)).map(k => [k, k + ' (Özel)']);
  const _tumListe = [...BIST, ..._ekstra];

  _tumListe
    .filter(([k, a]) => {
      if (filtre === 'takip'   && !takipEdilen.has(k)) return false;
      if (filtre === 'portfoy' && !portfoy[k])          return false;
      if (filtre === 'bist30'  && !BIST30.has(k))       return false;
      if (filtre === 'bist100' && !BIST100.has(k))      return false;
      if (q && !k.toLowerCase().includes(q) && !a.toLowerCase().includes(q)) return false;
      return true;
    })
    .forEach(([k, a]) => {
      const isTakip = takipEdilen.has(k);
      const isPF    = !!portfoy[k];
      const v       = veriler[k];
      const card    = document.createElement('div');

      let cardStyle = '';
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
          (isTakip && v?.sinyal ? `<span class="pill ${sc}" style="font-size:0.6rem">${v.sinyal}</span>` : '') +
          (isPF ? '<span class="pill bekle" style="font-size:0.6rem">PORTFÖY</span>' : '') +
          (!isTakip && v?.sinyal ? `<span class="pill ${sc2}" style="font-size:0.58rem">${v.sinyal}</span>` : '') +
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
    listeEl.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted)">Henüz sinyal geçmişi yok.</div>`;
    return;
  }

  listeEl.innerHTML = sinyalGecmisi.slice(0, 50).map(s => {
    const tarih    = new Date(s.tarih).toLocaleDateString('tr-TR');
    const saat     = new Date(s.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const sonucPill = s.dogrulandi === null
      ? `<span class="pill bekliyor">⏳ ${dogrulamaGun} gün bekleniyor</span>`
      : s.dogrulandi
        ? `<span class="pill dogrulandi">✓ Doğrulandı</span>`
        : `<span class="pill yanlis">✗ Yanlışlandı</span>`;
    const sonucYuzde = s.sonucYuzde !== null
      ? `<span class='${s.sonucYuzde >= 0 ? "pos" : "neg"} mono'>${s.sonucYuzde >= 0 ? '+' : ''}${s.sonucYuzde}%</span>`
      : '<span class="muted">—</span>';

    return `<div class="sinyal-item">
      <div class="sinyal-item-top">
        <span class="mono" style="font-weight:500">${s.sembol}</span>
        <span class="pill ${sinyalClass(s.sinyal)}">${s.sinyal}</span>
        ${sonucPill} ${sonucYuzde}
      </div>
      <div class="sinyal-item-meta">
        <span>📅 ${tarih} ${saat}</span>
        <span>Fiyat: <span class="mono">${s.fiyat}₺</span></span>
        <span>RSI: <span class="mono">${s.rsi?.toFixed(0)}</span></span>
        <span>Hacim: <span class="mono ${s.hacimFark > 0 ? 'pos' : 'muted'}">${s.hacimFark > 0 ? '+' : ''}${s.hacimFark}%</span></span>
        ${s.sonucFiyat ? `<span>Sonuç: <span class="mono">${s.sonucFiyat}₺</span></span>` : ''}
      </div>
    </div>`;
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
    wrapper.innerHTML = `<div style="text-align:center;padding:5rem;color:var(--muted)">
      <div style="font-size:2rem;margin-bottom:1rem">💼</div>
      <div style="margin-bottom:0.5rem;color:var(--text)">Portföyünüz boş</div>
      <div style="font-size:0.8rem">Hisse listesinde sağ tıklayarak portföye ekle</div>
    </div>`;
    return;
  }

  const { totMaliyet, totDeger, kz, kzp } = portfoyOzeti();

  const rows = items.map(([k, p]) => {
    const v    = veriler[k];
    const gf   = v?.fiyat || 0;
    const mal  = p.adet * p.alisFiyati;
    const deg  = gf ? p.adet * gf : 0;
    const kzSat  = deg - mal;
    const kzpSat = mal > 0 ? (kzSat / mal * 100) : 0;
    const sin  = v ? `<span class="pill ${sinyalClass(v.sinyal)}">${v.sinyal}</span>` : '—';

    return `<tr>
      <td><span class="mono" style="font-weight:500">${k}</span><br><span class="muted" style="font-size:0.68rem">${p.ad || ''}</span></td>
      <td class="mono">${p.adet}</td>
      <td class="mono">${p.alisFiyati.toFixed(2)} ₺</td>
      <td class="mono">${gf ? gf.toFixed(2) + ' ₺' : '—'}</td>
      <td class="mono">${mal.toFixed(0)} ₺</td>
      <td class="mono">${deg ? deg.toFixed(0) + ' ₺' : '—'}</td>
      <td class='mono ${kzSat >= 0 ? "pos" : "neg"}'>${kzSat >= 0 ? '+' : ''}${kzSat.toFixed(0)} ₺<br>
        <span style="font-size:0.72rem">${kzpSat >= 0 ? '+' : ''}${kzpSat.toFixed(1)}%</span></td>
      <td>${sin}</td>
      <td><button class="btn danger" onclick="window._uiCallbacks?.portfoyCikar('${k}')" style="font-size:0.72rem;padding:0.3rem 0.6rem">Çıkar</button></td>
    </tr>`;
  }).join('');

  wrapper.innerHTML = `
    <div class="portfoy-summary">
      <div class="grid-4" style="margin-bottom:0">
        <div><div class="card-title">Toplam Maliyet</div><div class="card-value" style="font-size:1.2rem">${totMaliyet.toFixed(0)} ₺</div></div>
        <div><div class="card-title">Güncel Değer</div><div class="card-value" style="font-size:1.2rem">${totDeger.toFixed(0)} ₺</div></div>
        <div><div class="card-title">Toplam K/Z</div><div class="card-value ${kz >= 0 ? 'green' : 'red'}" style="font-size:1.2rem">${kz >= 0 ? '+' : ''}${kz.toFixed(0)} ₺</div></div>
        <div><div class="card-title">Getiri</div><div class="card-value ${kzp >= 0 ? 'green' : 'red'}" style="font-size:1.2rem">${kzp >= 0 ? '+' : ''}${kzp.toFixed(1)}%</div></div>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Hisse</th><th>Adet</th><th>Alış</th><th>Güncel</th><th>Maliyet</th><th>Değer</th><th>K/Z</th><th>Sinyal</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
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

  el('detayHisseAdi').textContent   = kod;
  el('detayHisseSirket').textContent = ad;

  const takipBtn = el('detayTakipBtn');
  if (takipEdilen.has(kod)) { takipBtn.textContent = '★ Takipte'; takipBtn.style.color = 'var(--accent)'; }
  else                       { takipBtn.textContent = '☆ Takibe Al'; takipBtn.style.color = ''; }

  const ozetEl = el('detayOzetKartlar');
  if (v) {
    const degCls     = v.degisim >= 0 ? 'var(--accent)' : 'var(--red)';
    const sinyalCls  = sinyalClass(v.sinyal);
    const guven      = v.guvenSkoru ?? 0;
    const guvenCls   = guven >= 70 ? 'high' : guven >= 50 ? 'medium' : 'low';
    const rsiColor   = v.rsi < 30 ? 'var(--accent)' : v.rsi > 70 ? 'var(--red)' : 'var(--yellow)';
    const rsiEtiket  = v.rsi < 30 ? 'Aşırı Satım' : v.rsi > 70 ? 'Aşırı Alım' : 'Nötr';
    const macdRenk   = v.macdHist > 0 ? 'var(--accent)' : 'var(--red)';
    const stochRenk  = (v.stochRsi?.k ?? 50) < 20 ? 'var(--accent)' : (v.stochRsi?.k ?? 50) > 80 ? 'var(--red)' : 'var(--text)';
    const stochSub   = (v.stochRsi?.k ?? 50) < 20 ? 'Aşırı Satım' : (v.stochRsi?.k ?? 50) > 80 ? 'Aşırı Alım' : 'Nötr';

    ozetEl.innerHTML = `
      <div class="detay-hero" style="grid-column:1/-1">
        <div>
          <div class="detay-hero-fiyat">${v.fiyat} ₺</div>
          <div class="detay-hero-degisim" style="color:${degCls}">${v.degisim >= 0 ? '+' : ''}${v.degisim}%</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem">
          <span class="sinyal-badge ${sinyalCls}">${v.sinyal}</span>
          <div class="guven-wrap" style="justify-content:flex-end;min-width:100px">
            <div class="guven-bar"><div class="guven-fill ${guvenCls}" style="width:${guven}%"></div></div>
            <span class="guven-pct">${guven}%</span>
          </div>
        </div>
      </div>

      <div class="detay-micro-card ${v.rsi < 30 ? 'accent' : v.rsi > 70 ? 'danger' : ''}">
        <div class="detay-mc-label">RSI (14)</div>
        <div class="detay-mc-value" style="color:${rsiColor}">${v.rsi}</div>
        <div class="detay-mc-sub">${rsiEtiket}</div>
      </div>

      <div class="detay-micro-card ${v.macdHist > 0 ? 'accent' : 'danger'}">
        <div class="detay-mc-label">MACD Hist</div>
        <div class="detay-mc-value" style="color:${macdRenk}">${v.macdHist?.toFixed(3) ?? '—'}</div>
        <div class="detay-mc-sub">${v.macdHist > 0 ? 'Momentum +' : 'Momentum −'}</div>
      </div>

      <div class="detay-micro-card">
        <div class="detay-mc-label">Stoch RSI K</div>
        <div class="detay-mc-value" style="color:${stochRenk}">
          ${v.stochRsi ? v.stochRsi.k : '—'}
        </div>
        <div class="detay-mc-sub">${stochSub}</div>
      </div>`;
  } else {
    ozetEl.innerHTML = `<div style="grid-column:1/-1;color:var(--muted);font-size:0.8rem;padding:0.5rem">Veri yok — önce güncelle</div>`;
  }

  renderDetayTeknik(kod);

  const xu  = piyasaVerisi.xu100;
  const usd = piyasaVerisi.usdtry;
  const xuRenk     = (xu?.degisim ?? 0) >= 0 ? 'var(--accent)' : 'var(--red)';
  const piyasaRenk = (xu?.degisim ?? 0) > 0  ? 'var(--accent)'
                   : (xu?.degisim ?? 0) < -1  ? 'var(--red)' : 'var(--yellow)';
  const xuFiyatStr = xu
    ? xu.fiyat?.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ' + (xu.degisim >= 0 ? '+' : '') + xu.degisim + '%'
    : '—';
  const piyasaEtiket = (xu?.degisim ?? 0) > 1  ? '🟢 Yükseliş'
                     : (xu?.degisim ?? 0) < -1  ? '🔴 Düşüş' : '🟡 Yatay';
  const usdStr = usd ? usd.fiyat?.toFixed(2) + ' ₺' : '—';

  el('detayPiyasa').innerHTML = `
    <div style='display:flex;gap:1.5rem;flex-wrap:wrap'>
      <div><span style='color:var(--muted)'>BIST100:</span> <span style='font-family:var(--mono);color:${xuRenk}'>${xuFiyatStr}</span></div>
      <div><span style='color:var(--muted)'>USD/TRY:</span> <span style='font-family:var(--mono)'>${usdStr}</span></div>
      <div><span style='color:var(--muted)'>Piyasa:</span> <span style='color:${piyasaRenk}'>${piyasaEtiket}</span></div>
    </div>`;

  const ilgili = haberlerData.filter(h => h.baslik?.includes(kod) || h.baslik?.includes(ad.split(' ')[0]));
  if (ilgili.length > 0) {
    el('detayHaberler').innerHTML = ilgili.slice(0, 3).map(h =>
      `<div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.78rem">
        ${h.link ? `<a href="${h.link}" target="_blank" style="color:var(--text);text-decoration:none">${h.baslik}</a>` : h.baslik}
      </div>`
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
    el('detayPortfoy').innerHTML = `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><span style="color:var(--muted)">Adet:</span> <span class="mono">${pf.adet}</span></div>
        <div><span style="color:var(--muted)">Alış:</span> <span class="mono">${pf.alisFiyati} ₺</span></div>
        <div><span style='color:var(--muted)'>K/Z:</span> <span class='mono' style='color:${kz >= 0 ? "var(--accent)" : "var(--red)"}'>
          ${kz >= 0 ? '+' : ''}${kz.toFixed(0)} ₺ (${kzp}%)</span></div>
      </div>`;
  } else {
    el('detayPortfoyBlok').style.display = 'none';
  }

  el('detayAiIcerik').innerHTML = `<span style="color:var(--muted)">Analiz için butona bas...</span>`;
  el('detayAiBtn').disabled     = false;
  el('detayAiBtn').textContent  = '⬡ AI ile Analiz Et';

  openModal('hisseDetayModal');
  const modalBody = document.querySelector('#hisseDetayModal .modal-body');
  if (modalBody) modalBody.scrollTop = 0;
}

export function renderDetayTeknik(kod) {
  const v = state.veriler[kod];
  const teknikEl = el('detayTeknik');
  if (!v || !teknikEl) return;

  const maRenk  = v.ma20 > v.ma50 ? 'var(--accent)' : 'var(--red)';
  const bolRenk = !v.bollinger ? 'var(--muted)'
    : v.bollinger.yuzde < 25 ? 'var(--accent)'
    : v.bollinger.yuzde > 75 ? 'var(--red)' : 'var(--muted)';
  const wRenk   = v.williamsR < -80 ? 'var(--accent)' : v.williamsR > -20 ? 'var(--red)' : 'var(--muted)';
  const mfiRenk = v.mfi < 30 ? 'var(--accent)' : v.mfi > 70 ? 'var(--red)' : 'var(--muted)';
  const hRenk   = v.hacimFark > 0 ? 'var(--accent)' : 'var(--red)';
  const gRenk   = (v.guvenSkoru ?? 0) >= 70 ? 'var(--accent)' : (v.guvenSkoru ?? 0) >= 50 ? 'var(--yellow)' : 'var(--muted)';

  const bolVal  = v.bollinger ? v.bollinger.yuzde + '%' : '—';
  const bolSub  = v.bollinger?.yuzde < 25 ? 'Alt bant' : v.bollinger?.yuzde > 75 ? 'Üst bant' : 'Orta';
  const wVal    = v.williamsR ?? '—';
  const wSub    = v.williamsR < -80 ? 'Aşırı Satım' : v.williamsR > -20 ? 'Aşırı Alım' : 'Nötr';
  const mfiSub  = v.mfi < 30 ? 'Para çıkışı' : v.mfi > 70 ? 'Para girişi' : 'Dengeli';
  const hVal    = v.hacimFark > 0 ? '+' + v.hacimFark + '%' : v.hacimFark + '%';
  const hSub    = v.hacimFark > 50 ? 'Spike' : 'Normal';

  const mc = (lbl, val, sub, renk) => {
    const st = renk ? ` style="color:${renk}"` : '';
    const sb = sub  ? `<div class="mc-sub">${sub}</div>` : '';
    return `<div class="micro-card"><div class="mc-label">${lbl}</div><div class="mc-value"${st}>${val}</div>${sb}</div>`;
  };

  teknikEl.className = 'micro-grid';
  teknikEl.innerHTML =
    mc('Bollinger %', bolVal,   bolSub,           bolRenk) +
    mc('Williams %R', wVal,     wSub,             wRenk)   +
    mc('MFI',         v.mfi ?? '—', mfiSub,       mfiRenk) +
    mc('MA 20',       v.ma20 ? v.ma20.toFixed(2) + ' ₺' : '—', '', '') +
    mc('MA 50',       v.ma50 ? v.ma50.toFixed(2) + ' ₺' : '—', '', '') +
    mc('MA Trend',    v.ma20 > v.ma50 ? 'Yükseliş' : 'Düşüş', 'MA20/MA50', maRenk) +
    mc('Hacim',       hVal,    hSub,              hRenk)   +
    mc('Güven',       v.guvenSkoru != null ? v.guvenSkoru + '%' : '—', 'Ağırlıklı', gRenk) +
    (v.pivot   ? mc('Pivot',   v.pivot.pivot + ' ₺', 'R1: ' + v.pivot.r1, '') : '') +
    (v.fib     ? mc('Fib 38%', v.fib.f382 + ' ₺',   'Fib 62%: ' + v.fib.f618 + ' ₺', '') : '') +
    (v.hafta52H ? mc('52H Max', v.hafta52H + ' ₺',  'Poz: ' + v.hafta52Yuzde + '%', 'var(--red)') : '') +
    (v.hafta52L ? mc('52H Min', v.hafta52L + ' ₺',  '', 'var(--accent)') : '');
}

// ─────────────────────────────────────────────
// AI ANALİZ SONUCU — YENİ RENDER
// ─────────────────────────────────────────────
//
// api.js'den gelen analiz objesi:
//   Yeni format : { karar, ozet, maddeler[], destek, hedef, stopLoss, risk, uyari, tarih, sembol }
//   Eski format : { metin, tarih, sembol }  ← Firestore cache'den eski kayıtlar
//
// Her iki formatı sorunsuz gösterir.
// ─────────────────────────────────────────────

export function renderHisseAnalizSonucu(analiz) {
  const aiEl = el('detayAiIcerik');
  if (!aiEl || !analiz) return;

  // ── 1. Format normalize
  let veri = null;

  if (analiz.maddeler && Array.isArray(analiz.maddeler)) {
    // Yeni JSON format — direkt kullan
    veri = analiz;
  } else if (analiz.metin) {
    // Eski format: ham metin → JSON parse dene
    try {
      const temiz  = analiz.metin.replace(/```json|```/g, '').trim();
      const ilkSus = temiz.indexOf('{');
      const parsed = JSON.parse(ilkSus >= 0 ? temiz.slice(ilkSus) : temiz);
      if (parsed.maddeler) {
        veri = { ...parsed, tarih: analiz.tarih, sembol: analiz.sembol };
      }
    } catch (_) { /* parse başarısız — metin olarak göster */ }
  }

  // ── 2. Eski/parse edilemeyen metin → temizleyip madde madde göster
  if (!veri) {
    const kaynak = analiz.metin || (typeof analiz === 'string' ? analiz : '');
    if (!kaynak) {
      aiEl.innerHTML = '<span style="color:var(--muted);font-size:0.8rem">Analiz verisi okunamadı.</span>';
      return;
    }

    const temizlendi = kaynak
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^---+$/gm, '')
      .replace(/^>\s*/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const satirlar = temizlendi
      .split(/\n+/)
      .map(s => s.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean);

    const tarihHtml = analiz.tarih
      ? '<div style="font-size:0.63rem;color:var(--muted);font-family:var(--mono);margin-bottom:0.65rem">' +
        new Date(analiz.tarih).toLocaleString('tr-TR') + '</div>'
      : '';

    aiEl.innerHTML = tarihHtml +
      '<div style="display:flex;flex-direction:column;gap:0.4rem">' +
      satirlar.map(s =>
        '<div style="display:flex;align-items:flex-start;gap:0.5rem;' +
        'padding:0.5rem 0.65rem;border-radius:8px;background:rgba(255,255,255,0.03)">' +
        '<span style="color:var(--accent);flex-shrink:0;margin-top:1px">›</span>' +
        '<span style="font-size:0.81rem;line-height:1.65;color:#b8ddd0">' + s + '</span>' +
        '</div>'
      ).join('') +
      '</div>';
    return;
  }

  // ── 3. Yeni JSON format — zengin kart layout
  const kararCls = veri.karar === 'AL'   ? 'guclu-al' :
                   veri.karar === 'ALMA'  ? 'guclu-sat' : 'bekle';
  const riskRenk = veri.risk === 'Düşük' ? 'var(--accent)' :
                   veri.risk === 'Yüksek' ? 'var(--red)'    : 'var(--yellow)';

  const chip = (lbl, val, renk) => {
    if (!val || val === 0) return '';
    const st = renk ? ' style="color:' + renk + '"' : '';
    return '<div class="micro-card" style="min-width:80px">' +
      '<div class="mc-label">' + lbl + '</div>' +
      '<div class="mc-value mono"' + st + '>' + val + ' ₺</div>' +
      '</div>';
  };

  const maddeHTML = (veri.maddeler || []).map(m =>
    '<div style="display:flex;gap:0.6rem;align-items:flex-start;' +
    'padding:0.5rem 0.65rem;border-radius:8px;' +
    'background:rgba(255,255,255,0.035);margin-bottom:0.3rem">' +
    '<span style="font-size:0.95rem;line-height:1.5;flex-shrink:0">' + (m.ikon || '•') + '</span>' +
    '<div style="flex:1;min-width:0">' +
    '<div style="font-size:0.78rem;font-weight:600;color:#e0f0e8;margin-bottom:0.15rem">' + (m.baslik || '') + '</div>' +
    '<div style="font-size:0.76rem;line-height:1.65;color:#9bbfb0">' + (m.aciklama || '') + '</div>' +
    '</div></div>'
  ).join('');

  const tarihStr = veri.tarih ? new Date(veri.tarih).toLocaleString('tr-TR') : '';

  aiEl.innerHTML =
    // Başlık: karar badge + tarih
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">' +
    '<span class="sinyal-badge ' + kararCls + '" style="font-size:0.88rem;padding:0.35rem 1rem">' + (veri.karar || '—') + '</span>' +
    '<span style="font-size:0.63rem;color:var(--muted);font-family:var(--mono)">' + tarihStr + '</span>' +
    '</div>' +

    // Özet cümle
    (veri.ozet
      ? '<div style="font-size:0.82rem;line-height:1.6;color:#c8e6d8;padding:0.5rem 0.65rem;border-radius:8px;' +
        'background:rgba(0,229,160,0.06);border-left:2px solid rgba(0,229,160,0.3);margin-bottom:0.65rem">' +
        veri.ozet + '</div>'
      : '') +

    // Madde madde açıklamalar
    '<div style="margin-bottom:0.65rem">' + maddeHTML + '</div>' +

    // Fiyat seviyeleri kartları
    '<div class="micro-grid" style="grid-template-columns:repeat(auto-fill,minmax(85px,1fr));margin-bottom:0.5rem">' +
    chip('Destek',  veri.destek,  '') +
    chip('Hedef',   veri.hedef,   'var(--accent)') +
    chip('Stop',    veri.stopLoss,'var(--red)') +
    (veri.risk
      ? '<div class="micro-card"><div class="mc-label">Risk</div>' +
        '<div class="mc-value" style="color:' + riskRenk + '">' + veri.risk + '</div></div>'
      : '') +
    '</div>' +

    // Uyarı notu
    (veri.uyari
      ? '<div style="font-size:0.72rem;color:var(--muted);line-height:1.55;padding:0.4rem 0.6rem;border-radius:6px;' +
        'background:rgba(255,209,102,0.06);border-left:2px solid rgba(255,209,102,0.25)">⚠️ ' +
        veri.uyari + '</div>'
      : '');
}

// ─────────────────────────────────────────────
// HABERLER
// ─────────────────────────────────────────────

export function renderHaberler() {
  const { haberlerData } = state;
  const listeEl = el('haberListesi');
  const apiVar  = aktifKey();

  if (haberlerData.length === 0) {
    listeEl.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted)">Haber bulunamadı</div>`;
    return;
  }

  listeEl.innerHTML = haberlerData.map((h, idx) => {
    const tarihStr = h.tarih ? new Date(h.tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const kaynak   = h.kaynak?.includes('dunya') ? 'Dünya' : h.kaynak?.includes('bloomberg') ? 'Bloomberg HT' : h.kaynak?.includes('bbc') ? 'BBC Türkçe' : 'Finans';

    return `<div class="haber-card" id="haber-${idx}">
      <div class="haber-baslik">${h.link ? `<a href="${h.link}" target="_blank" rel="noopener">${h.baslik}</a>` : h.baslik}</div>
      ${h.aciklama ? `<div class="haber-aciklama">${h.aciklama}...</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem">
        <div class="haber-meta"><span>📰 ${kaynak}</span>${tarihStr ? `<span>🕐 ${tarihStr}</span>` : ''}</div>
        ${apiVar ? `<button class="btn" onclick="window._uiCallbacks?.haberAnalizEt(${idx})" id="analiz-btn-${idx}" style="font-size:0.7rem;padding:0.25rem 0.6rem;color:var(--accent);border-color:rgba(0,229,160,0.3)">⬡ AI Analiz</button>` : ''}
      </div>
      <div id="analiz-${idx}"></div>
    </div>`;
  }).join('');
}

export function renderHaberAnaliz(idx, analiz) {
  const analizEl = el('analiz-' + idx);
  if (!analizEl || !analiz) return;
  analizEl.innerHTML = `
    <div style="margin-top:0.75rem;padding:0.75rem;background:rgba(0,229,160,0.04);border:1px solid rgba(0,229,160,0.12);border-radius:8px">
      <div style="font-size:0.68rem;color:var(--accent);font-family:var(--mono);margin-bottom:0.5rem">⬡ AI ETKİ ANALİZİ</div>
      ${analiz.hisseler?.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem">
        ${analiz.hisseler.map(x => `
          <div style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;
            background:${x.etki === 'olumlu' ? 'rgba(0,229,160,0.12)' : x.etki === 'olumsuz' ? 'rgba(255,69,96,0.12)' : 'rgba(255,209,102,0.12)'};
            border:1px solid ${x.etki === 'olumlu' ? 'rgba(0,229,160,0.3)' : x.etki === 'olumsuz' ? 'rgba(255,69,96,0.3)' : 'rgba(255,209,102,0.3)'}">
            <span>${x.etki === 'olumlu' ? '🟢' : x.etki === 'olumsuz' ? '🔴' : '🟡'}</span>
            <span style="font-family:var(--mono);font-size:0.72rem;font-weight:500">${x.kod}</span>
            <span style="font-size:0.65rem;color:var(--muted)">${x.tip === 'direkt' ? 'Doğrudan' : 'Dolaylı'}</span>
          </div>`).join('')}
      </div>` : ''}
      <div style="font-size:0.78rem;color:#b0d8c8;line-height:1.6">${analiz.yorum || ''}</div>
      ${analiz.sure ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:0.4rem;font-family:var(--mono)">⏱ ${analiz.sure}</div>` : ''}
    </div>`;
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
    listeEl.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted)">
      <div style="font-size:2rem;margin-bottom:1rem">📖</div>
      <div style="color:var(--text);margin-bottom:0.5rem">Sözlüğün henüz boş</div>
      <div style="font-size:0.8rem">Yukarıdaki terimlerden birine tıkla, Claude açıklasın</div>
    </div>`;
    return;
  }

  listeEl.innerHTML = filtered.map(t => `
    <div class="terim-card ${t.acik ? 'acik' : ''}" onclick="window._uiCallbacks?.toggleTerim('${t.id}')">
      <div class="terim-baslik">
        <span>${t.terim}</span>
        <span class="pill al" style="font-size:0.6rem">${t.sorulma || 1}x soruldu</span>
        ${isAdmin ? `<button class="btn primary" onclick="event.stopPropagation();window._uiCallbacks?.pushTerimGonder('${t.id}')" style="font-size:0.65rem;padding:2px 8px;margin-left:auto">📢 Push</button>` : ''}
      </div>
      <div class="terim-aciklama">${t.aciklama || ''}</div>
      <div class="terim-meta">
        <span>📅 ${t.tarih ? new Date(t.tarih).toLocaleDateString('tr-TR') : '—'}</span>
        ${t.ekleyenAd ? `<span>👤 ${t.ekleyenAd}</span>` : ''}
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// PUSH BİLDİRİM
// ─────────────────────────────────────────────

export function showPushBildirim(baslik, mesaj) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:80px;right:1.5rem;z-index:700;background:var(--bg2);border:1px solid rgba(0,229,160,0.3);border-radius:16px;padding:1.25rem;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:modalIn 0.3s ease';
  div.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:0.75rem">
      <div style="font-size:1.5rem">📢</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:0.3rem">${baslik}</div>
        <div style="font-size:0.78rem;color:var(--muted);line-height:1.5">${mesaj}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem">✕</button>
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 8000);
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
}

// ─────────────────────────────────────────────
// GLOBAL KÖPRÜ — window._uiCallbacks
// ─────────────────────────────────────────────

window._uiCallbacks = {};
window.hisseDetayAc = (kod) => window._uiCallbacks?.hisseDetayAc?.(kod);