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

export function renderPiyasaKartlari() {
  const { xu100, usdtry, eurtry } = state.piyasaVerisi;

  if (xu100) {
    el('xu100Deger').textContent  = xu100.fiyat?.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    const xuDeg = el('xu100Degisim');
    xuDeg.textContent  = `${xu100.degisim >= 0 ? '+' : ''}${xu100.degisim}%`;
    xuDeg.style.color  = xu100.degisim >= 0 ? 'var(--accent)' : 'var(--red)';
  }

  if (usdtry) {
    el('usdtryDeger').textContent = usdtry.fiyat?.toFixed(2) + ' ₺';
    const usdDeg = el('usdtryDegisim');
    usdDeg.textContent = `${usdtry.degisim >= 0 ? '+' : ''}${usdtry.degisim}%`;
    usdDeg.style.color = usdtry.degisim >= 0 ? 'var(--red)' : 'var(--accent)'; // TL için ters
  }

  if (eurtry) {
    el('eurtryDeger').textContent = eurtry.fiyat?.toFixed(2) + ' ₺';
    const eurDeg = el('eurtryDegisim');
    eurDeg.textContent = `${eurtry.degisim >= 0 ? '+' : ''}${eurtry.degisim}%`;
    eurDeg.style.color = eurtry.degisim >= 0 ? 'var(--red)' : 'var(--accent)';
  }

  renderPiyasaYonu();
}

export function renderPiyasaYonu() {
  const xu100 = state.piyasaVerisi.xu100;
  if (!xu100) return;

  const deg = xu100.degisim;
  let yon, aciklama, renk;

  if      (deg >= 1.5)  { yon = '🟢 Güçlü Yükseliş'; aciklama = 'AL sinyalleri güçlü';    renk = 'var(--accent)'; }
  else if (deg >= 0)    { yon = '🟡 Yatay/Hafif +';  aciklama = 'Seçici alım yapılabilir'; renk = 'var(--yellow)'; }
  else if (deg >= -1.5) { yon = '🟠 Hafif Düşüş';    aciklama = 'AL sinyallerine dikkat';  renk = 'var(--yellow)'; }
  else                  { yon = '🔴 Güçlü Düşüş';    aciklama = 'SAT baskısı var';          renk = 'var(--red)'; }

  el('piyasaYonu').textContent          = yon;
  el('piyasaYonu').style.fontSize       = '0.9rem';
  el('piyasaYonuAciklama').textContent  = aciklama;
}

// ─────────────────────────────────────────────
// ÖZET KARTLAR (takip, güçlü al/sat, isabet)
// ─────────────────────────────────────────────

export function renderSummary() {
  const { veriler, takipEdilen } = state;
  const { dogru, yanlis, toplam, isabet } = sinyalIstatistik();

  el('sumTakip').textContent  = takipEdilen.size;
  el('sumAl').textContent     = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ AL').length  || '—';
  el('sumSat').textContent    = Object.values(veriler).filter(v => v.sinyal === 'GÜÇLÜ SAT').length || '—';
  el('sumIsabet').textContent = toplam > 0 ? `%${isabet}` : '—';

  // Sinyal tab özet
  el('sinTopToplam').textContent  = state.sinyalGecmisi.length;
  el('sinTopDogru').textContent   = dogru;
  el('sinTopYanlis').textContent  = yanlis;
  el('sinTopIsabet').textContent  = toplam > 0 ? `%${isabet}` : '—';
}

// ─────────────────────────────────────────────
// DASHBOARD TABLOSU
// ─────────────────────────────────────────────

export function renderDashboard() {
  const { veriler, takipEdilen, sinyalGecmisi } = state;
  const tbody = el('dashTableBody');
  const rows  = Object.entries(veriler).filter(([k]) => takipEdilen.has(k));

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--muted)">Henüz veri yok. Hisseler sekmesinden hisse seç → Güncelle\'ye bas.</td></tr>';
    return;
  }

  // AI yorumunu göster
  const lastSinyal = sinyalGecmisi[0];
  if (lastSinyal?.aiYorum) {
    el('aiBoxContainer').innerHTML =
      '<div class="ai-box">' +
        '<div class="ai-box-header">' +
          '<div class="ai-icon">⬡</div>' +
          '<div class="ai-box-title">Claude AI Analizi</div>' +
          '<div class="ai-box-time">' + new Date(lastSinyal.tarih).toLocaleString('tr-TR') + '</div>' +
        '</div>' +
        '<div class="ai-content">' + lastSinyal.aiYorum + '</div>' +
      '</div>';
  }

  tbody.innerHTML = rows.map(([k, v]) => {
    const rsiPct  = Math.min(100, Math.max(0, v.rsi));
    const rsiColor = v.rsi < 30 ? 'var(--accent)' : v.rsi > 70 ? 'var(--red)' : 'var(--yellow)';
    const cls     = sinyalClass(v.sinyal);
    const degCls  = v.degisim >= 0 ? 'pos' : 'neg';
    const hacimTxt = v.hacimFark > 0
      ? `<span class="pos">+${v.hacimFark}%</span>`
      : v.hacimFark < 0 ? `<span class="neg">${v.hacimFark}%</span>` : '—';

    return `<tr>
      <td>
        <span class="mono" style="font-weight:500;cursor:pointer;color:var(--accent)"
          onclick="hisseDetayAc('${k}')">${k}</span>
      </td>
      <td class="mono">${v.fiyat} ₺</td>
      <td class="mono ${degCls}">${v.degisim >= 0 ? '+' : ''}${v.degisim}%</td>
      <td>
        <div class="rsi-wrap">
          <div class="rsi-bar"><div class="rsi-fill" style="width:${rsiPct}%;background:${rsiColor}"></div></div>
          <span class="mono" style="font-size:0.75rem;color:${rsiColor}">${v.rsi}</span>
        </div>
      </td>
      <td class="mono" style="font-size:0.72rem;color:${v.stochRsi?.k < 20 ? 'var(--accent)' : v.stochRsi?.k > 80 ? 'var(--red)' : 'var(--muted)'}">
        ${v.stochRsi ? v.stochRsi.k : '—'}
      </td>
      <td class="mono" style="font-size:0.72rem;color:${v.macdHist > 0 ? 'var(--accent)' : 'var(--red)'}">
        ${v.macdHist?.toFixed(3) ?? '—'}
      </td>
      <td>${hacimTxt}</td>
      <td><span class="pill ${cls}">${v.sinyal}</span></td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// HİSSE LİSTESİ (GRID)
// ─────────────────────────────────────────────

export function renderHisseler() {
  const { veriler, takipEdilen, portfoy, aktifFilter: filtre } = state;
  const q    = (el('searchInput')?.value || '').toLowerCase();
  const grid = el('hisseGrid');
  grid.innerHTML = '';

  BIST
    .filter(([k, a]) => {
      if (filtre === 'takip'   && !takipEdilen.has(k)) return false;
      if (filtre === 'portfoy' && !portfoy[k])          return false;
      if (filtre === 'bist30'  && !BIST30.has(k))       return false;
      if (filtre === 'bist100' && !BIST100.has(k))      return false;
      if (q && !k.toLowerCase().includes(q) && !a.toLowerCase().includes(q)) return false;
      return true;
    })
    .filter(([k]) => {
      if (Object.keys(veriler).length === 0) return true;
      return veriler[k] !== undefined;
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

      // Analiz butonu
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
    const tarih    = new Date(s.tarih).toLocaleDateString('tr-TR');
    const saat     = new Date(s.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const sonucPill = s.dogrulandi === null
      ? `<span class="pill bekliyor">⏳ ${dogrulamaGun} gün bekleniyor</span>`
      : s.dogrulandi
        ? `<span class="pill dogrulandi">✓ Doğrulandı</span>`
        : `<span class="pill yanlis">✗ Yanlışlandı</span>`;
    const sonucYuzde = s.sonucYuzde !== null
      ? `<span class="${s.sonucYuzde >= 0 ? 'pos' : 'neg'} mono">${s.sonucYuzde >= 0 ? '+' : ''}${s.sonucYuzde}%</span>`
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
      <td class="mono ${kzSat >= 0 ? 'pos' : 'neg'}">${kzSat >= 0 ? '+' : ''}${kzSat.toFixed(0)} ₺<br>
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

  // Takip butonu
  const takipBtn = el('detayTakipBtn');
  if (takipEdilen.has(kod)) { takipBtn.textContent = '★ Takipte'; takipBtn.style.color = 'var(--accent)'; }
  else                       { takipBtn.textContent = '☆ Takibe Al'; takipBtn.style.color = ''; }

  // Özet kartlar
  const ozetEl = el('detayOzetKartlar');
  if (v) {
    const degCls    = v.degisim >= 0 ? 'var(--accent)' : 'var(--red)';
    const sinyalRenk = v.sinyal?.includes('AL') ? 'var(--accent)' : v.sinyal?.includes('SAT') ? 'var(--red)' : 'var(--yellow)';
    ozetEl.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="card-title">Fiyat</div>
        <div class="card-value" style="font-size:1.1rem">${v.fiyat} ₺</div>
        <div style="font-size:0.72rem;color:${degCls};font-family:var(--mono)">${v.degisim >= 0 ? '+' : ''}${v.degisim}%</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="card-title">RSI</div>
        <div class="card-value" style="font-size:1.1rem;color:${v.rsi < 30 ? 'var(--accent)' : v.rsi > 70 ? 'var(--red)' : 'var(--yellow)'}">${v.rsi}</div>
        <div style="font-size:0.7rem;color:var(--muted)">${v.rsi < 30 ? 'Aşırı Satım' : v.rsi > 70 ? 'Aşırı Alım' : 'Nötr'}</div>
      </div>
      <div class="card" style="text-align:center">
        <div class="card-title">Sinyal</div>
        <div style="font-size:0.9rem;font-weight:600;color:${sinyalRenk};margin-top:0.3rem">${v.sinyal || '—'}</div>
      </div>`;
  } else {
    ozetEl.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:0.8rem;padding:0.5rem">Veri yok — önce güncelle</div>';
  }

  // Teknik göstergeler
  renderDetayTeknik(kod);

  // Piyasa bağlamı
  const xu  = piyasaVerisi.xu100;
  const usd = piyasaVerisi.usdtry;
  el('detayPiyasa').innerHTML = `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
      <div><span style="color:var(--muted)">BIST100:</span> <span style="font-family:var(--mono);color:${xu?.degisim >= 0 ? 'var(--accent)' : 'var(--red)'}">${xu ? xu.fiyat?.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ' + (xu.degisim >= 0 ? '+' : '') + xu.degisim + '%' : '—'}</span></div>
      <div><span style="color:var(--muted)">USD/TRY:</span> <span style="font-family:var(--mono)">${usd ? usd.fiyat?.toFixed(2) + ' ₺' : '—'}</span></div>
      <div><span style="color:var(--muted)">Piyasa:</span> <span style="color:${xu?.degisim > 0 ? 'var(--accent)' : xu?.degisim < -1 ? 'var(--red)' : 'var(--yellow)'}">${xu?.degisim > 1 ? '🟢 Yükseliş' : xu?.degisim < -1 ? '🔴 Düşüş' : '🟡 Yatay'}</span></div>
    </div>`;

  // İlgili haberler
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

  // Portföy durumu
  const pf = portfoy[kod];
  if (pf && v) {
    const kz  = (v.fiyat - pf.alisFiyati) * pf.adet;
    const kzp = ((v.fiyat - pf.alisFiyati) / pf.alisFiyati * 100).toFixed(1);
    el('detayPortfoyBlok').style.display = 'block';
    el('detayPortfoy').innerHTML = `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><span style="color:var(--muted)">Adet:</span> <span class="mono">${pf.adet}</span></div>
        <div><span style="color:var(--muted)">Alış:</span> <span class="mono">${pf.alisFiyati} ₺</span></div>
        <div><span style="color:var(--muted)">K/Z:</span> <span class="mono" style="color:${kz >= 0 ? 'var(--accent)' : 'var(--red)'}">
          ${kz >= 0 ? '+' : ''}${kz.toFixed(0)} ₺ (${kzp}%)</span></div>
      </div>`;
  } else {
    el('detayPortfoyBlok').style.display = 'none';
  }

  // AI içeriği sıfırla
  el('detayAiIcerik').innerHTML = '<span style="color:var(--muted)">Analiz için butona bas...</span>';
  el('detayAiBtn').disabled     = false;
  el('detayAiBtn').textContent  = '⬡ AI ile Analiz Et';

  openModal('hisseDetayModal');
}

export function renderDetayTeknik(kod) {
  const v = state.veriler[kod];
  const teknikEl = el('detayTeknik');
  if (!v || !teknikEl) return;

  const macdRenk = v.macdHist > 0 ? 'var(--accent)' : 'var(--red)';
  const maRenk   = v.ma20 > v.ma50 ? 'var(--accent)' : 'var(--red)';

  teknikEl.innerHTML =
    `<div><span style="color:var(--muted)">MACD Hist:</span> <span style="color:${macdRenk};font-family:var(--mono)">${v.macdHist?.toFixed(3) ?? '—'}</span></div>` +
    `<div><span style="color:var(--muted)">Stoch RSI K:</span> <span style="font-family:var(--mono);color:${v.stochRsi?.k < 20 ? 'var(--accent)' : v.stochRsi?.k > 80 ? 'var(--red)' : 'inherit'}">${v.stochRsi ? v.stochRsi.k : '—'}</span></div>` +
    `<div><span style="color:var(--muted)">Bollinger %:</span> <span style="font-family:var(--mono);color:${v.bollinger?.yuzde < 25 ? 'var(--accent)' : v.bollinger?.yuzde > 75 ? 'var(--red)' : 'inherit'}">${v.bollinger ? v.bollinger.yuzde + '%' : '—'}</span></div>` +
    `<div><span style="color:var(--muted)">Williams %R:</span> <span style="font-family:var(--mono);color:${v.williamsR < -80 ? 'var(--accent)' : v.williamsR > -20 ? 'var(--red)' : 'inherit'}">${v.williamsR ?? '—'}</span></div>` +
    `<div><span style="color:var(--muted)">MFI:</span> <span style="font-family:var(--mono);color:${v.mfi < 30 ? 'var(--accent)' : v.mfi > 70 ? 'var(--red)' : 'inherit'}">${v.mfi ?? '—'}</span></div>` +
    `<div><span style="color:var(--muted)">Güven Skoru:</span> <span style="font-family:var(--mono);color:${(v.guvenSkoru || 0) >= 70 ? 'var(--accent)' : (v.guvenSkoru || 0) >= 50 ? 'var(--yellow)' : 'var(--red)'}">${v.guvenSkoru ?? '—'}%</span></div>` +
    `<div><span style="color:var(--muted)">Hacim:</span> <span style="font-family:var(--mono);color:${v.hacimFark > 0 ? 'var(--accent)' : 'var(--red)'}">${v.hacimFark > 0 ? '+' : ''}${v.hacimFark}%</span></div>` +
    `<div><span style="color:var(--muted)">MA20:</span> <span style="font-family:var(--mono)">${v.ma20?.toFixed(2)} ₺</span></div>` +
    `<div><span style="color:var(--muted)">MA50:</span> <span style="font-family:var(--mono)">${v.ma50?.toFixed(2)} ₺</span></div>` +
    `<div><span style="color:var(--muted)">MA Trend:</span> <span style="color:${maRenk}">${v.ma20 > v.ma50 ? '📈 Yükseliş' : '📉 Düşüş'}</span></div>` +
    `<div><span style="color:var(--muted)">Hacim/Ort:</span> <span>${v.hacimFark > 50 ? '⚡ Spike' : 'Normal'}</span></div>` +
    (v.pivot ? `<div style="grid-column:1/-1;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border)"><span style="color:var(--muted)">Pivot:</span> <span class="mono">${v.pivot.pivot}</span> <span style="color:var(--muted)">R1:</span> <span class="mono" style="color:var(--red)">${v.pivot.r1}</span> <span style="color:var(--muted)">S1:</span> <span class="mono" style="color:var(--accent)">${v.pivot.s1}</span></div>` : '') +
    (v.fib ? `<div style="grid-column:1/-1"><span style="color:var(--muted)">Fib 0.382:</span> <span class="mono">${v.fib.f382} ₺</span> <span style="color:var(--muted)">Fib 0.618:</span> <span class="mono">${v.fib.f618} ₺</span></div>` : '') +
    (v.hafta52H ? `<div style="grid-column:1/-1"><span style="color:var(--muted)">52H:</span> <span class="mono" style="color:var(--red)">${v.hafta52H} ₺</span> <span style="color:var(--muted)">52L:</span> <span class="mono" style="color:var(--accent)">${v.hafta52L} ₺</span> <span style="color:var(--muted)">Poz:</span> <span class="mono">${v.hafta52Yuzde}%</span></div>` : '');
}

export function renderHisseAnalizSonucu(analiz) {
  const aiEl = el('detayAiIcerik');
  if (!aiEl || !analiz) return;
  const kararRenk = analiz.karar === 'AL' ? 'var(--accent)' : analiz.karar === 'ALMA' ? 'var(--red)' : 'var(--yellow)';
  aiEl.innerHTML = `
    <div style="text-align:center;margin-bottom:1rem">
      <div style="font-size:1.8rem;font-weight:700;color:${kararRenk}">${analiz.karar || '—'}</div>
      <div style="font-size:0.72rem;color:var(--muted);font-family:var(--mono)">AI Kararı</div>
    </div>
    <div style="font-size:0.82rem;line-height:1.8;color:#b0d8c8;margin-bottom:0.75rem">${analiz.gerekce || ''}</div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.75rem">
      ${analiz.girisFiyati ? `<div style="background:var(--bg4);padding:4px 10px;border-radius:6px"><span style="color:var(--muted)">Giriş:</span> <span class="mono">${analiz.girisFiyati} ₺</span></div>` : ''}
      ${analiz.stopLoss    ? `<div style="background:var(--bg4);padding:4px 10px;border-radius:6px"><span style="color:var(--muted)">Stop:</span> <span class="mono" style="color:var(--red)">${analiz.stopLoss} ₺</span></div>` : ''}
      ${analiz.hedefFiyat  ? `<div style="background:var(--bg4);padding:4px 10px;border-radius:6px"><span style="color:var(--muted)">Hedef:</span> <span class="mono" style="color:var(--accent)">${analiz.hedefFiyat} ₺</span></div>` : ''}
      ${analiz.risk        ? `<div style="background:var(--bg4);padding:4px 10px;border-radius:6px"><span style="color:var(--muted)">Risk:</span> <span>${analiz.risk}</span></div>` : ''}
    </div>
    <div style="font-size:0.65rem;color:var(--muted);margin-top:0.75rem;font-family:var(--mono)">${new Date(analiz.tarih).toLocaleString('tr-TR')}</div>`;
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
  if (!container || container.childNodes.length > 0) return; // tek sefer
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
  // Tüm nav butonlarından active kaldır
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  // Hem <div> hem <main> panel'lerini gizle
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Seçilen butonu vurgula
  if (buttonEl) buttonEl.classList.add('active');
  // Hedef paneli göster
  const target = el('panel-' + name);
  if (target) target.classList.add('active');
}

// ─────────────────────────────────────────────
// GLOBAL KÖPRÜ — window._uiCallbacks
//
// ui.js DOM event'lerinden app.js'deki fonksiyonlara
// bağlanmak için bu nesneyi kullanır.
// app.js başlarken bu nesneyi doldurur.
// ─────────────────────────────────────────────

window._uiCallbacks = {};

// hisseDetayAc global olarak da erişilebilir olmalı
// (onclick string'lerinde doğrudan çağrılıyor)
window.hisseDetayAc = (kod) => window._uiCallbacks?.hisseDetayAc?.(kod);
