// ══════════════════════════════════════════════
// HisseMatik — Ana Orkestrasyon
// assets/js/app.js
//
// Bu dosya her şeyi birbirine bağlar:
//   • Firebase auth akışı
//   • State başlatma ve güncelleme
//   • UI event handler'ları (window.*)
//   • Veri güncelleme döngüsü
//   • Tab ve modal koordinasyonu
// ══════════════════════════════════════════════

// ── İmport'lar ────────────────────────────────
import {
  auth, db, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp,
} from './firebase.js';

import {
  state, setState, resetState,
  ADMIN_EMAILS, BIST, BIST30, BIST100,
  aktifKey, aiGerekliMi, aiCalistiKaydet,
  hisseAdi,
} from './state.js';

import { parseYahooVeri } from './indicators.js';

import {
  fetchTumHisseFiyatlari,
  fetchTopluYahoo,
  fetchPiyasaVerisi,
  fetchHaberler,
  fetchYahoo,
  aiPortfoyAnalizYap,
  aiHisseAnalizEt,
  aiHaberAnalizEt,
  aiTerimAcikla,
  aiGunSonuOzeti,
  sinyalKaydet,
  loadSinyalGecmisi,
  sinyalleriDogrula,
  mukerrerSinyalleriTemizle,
  saveUserData,
  saveApiKey as apiSaveApiKey,
  loadHavuzKey,
  pushMesajGonder,
  checkPushMesajlar,
  loadSozluk,
  sozlukTerimKaydet,
  sozlukSorulmaSayisiArtir,
  hisseAnalizCache,
  hisseAnalizKaydet,
  haberAnalizCache,
  haberAnalizKaydet,
  haberHashOlustur,
  tokenKaydet,
  sleep,
} from './api.js';

import {
  el, setStatus, showLoading, setLoadingMsg, hideLoading,
  showToast, closeModal, openModal,
  renderTopbar, renderPiyasaKartlari, renderSummary,
  renderDashboard, renderHisseler, renderSinyalGecmisi,
  renderPortfoy, portfoyModalAc,
  renderHisseDetay, renderDetayTeknik, renderHisseAnalizSonucu,
  renderHaberler, renderHaberAnaliz,
  renderSozluk, renderPopularTerimler,
  showPushBildirim, switchTab,
} from './ui.js';

// ─────────────────────────────────────────────
// SÖZLÜK LOCAL STATE
// (Firestore'dan yüklenen terim listesi —
//  state.js'e taşımak yerine burada tutuyoruz
//  çünkü sadece sözlük tab'ında kullanılıyor)
// ─────────────────────────────────────────────
let sozlukVeriler = [];

// ─────────────────────────────────────────────
// UI CALLBACK KÖPRÜSÜ
// ui.js'deki onclick'ler buraya yönlenir
// ─────────────────────────────────────────────
window._uiCallbacks = {
  toggleTakip:     (k)     => toggleTakip(k),
  portfoyCikar:    (k)     => portfoyCikar(k),
  hisseDetayAc:    (k)     => hisseDetayAc(k),
  haberAnalizEt:   (idx)   => tekHaberAnalizEt(idx),
  terimSor:        (terim) => terimSorAPI(terim),
  toggleTerim:     (id)    => toggleTerim(id),
  pushTerimGonder: (id)    => pushTerimGonderById(id),
};

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

window.googleLogin = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    showToast('Giriş başarısız: ' + e.message, 'error');
  }
};

window.logout = async () => {
  await signOut(auth);
  resetState();
  location.reload();
};

onAuthStateChanged(auth, async (user) => {
  el('loadingScreen').classList.add('hide');

  if (!user) {
    el('authScreen').style.display = 'flex';
    el('appShell').style.display   = 'none';
    return;
  }

  // Erişim kontrolü
  const userRef  = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const isAdmin  = ADMIN_EMAILS.includes(user.email);

  if (!isAdmin && !userSnap.exists()) {
    showToast('Bu e-posta ile erişim izniniz yok.', 'error');
    await signOut(auth);
    el('authScreen').style.display = 'flex';
    return;
  }

  const userDoc = userSnap.exists() ? userSnap.data() : {};

  // Admin kaydı yoksa oluştur
  if (isAdmin && !userSnap.exists()) {
    await setDoc(userRef, {
      email: user.email, name: user.displayName || 'Admin',
      isAdmin: true, plan: 'full', active: true,
      createdAt: serverTimestamp(),
    });
  }

  // State'i doldur
  setState({
    currentUser:   user,
    userDoc,
    isAdmin,
    anthropicKey:  userDoc.apiKey || '',
    takipEdilen:   new Set(userDoc.takipEdilen || []),
    portfoy:       userDoc.portfoy  || {},
    veriler:       userDoc.veriler  || {},
  });

  // Havuz key
  const havuzKey = await loadHavuzKey({ db });
  setState({ havuzKey, anthropicKey: havuzKey || state.anthropicKey });

  // UI
  el('authScreen').style.display = 'none';
  el('appShell').style.display   = 'block';
  renderTopbar();

  if (isAdmin) loadAdminPanel();

  // İlk yüklemeler
  await _piyasaVerisiCek();
  await checkPushMesajlar({ db, currentUser: user, onMesaj: showPushBildirim });
  state.sinyalGecmisi = await loadSinyalGecmisi({ db, currentUser: user });
  await _sinyalleriDogrula();

  renderHisseler();
  renderDashboard();
  renderPortfoy();
  renderSummary();
});

// ─────────────────────────────────────────────
// TAB YÖNETİMİ
// ─────────────────────────────────────────────

/**
 * Tab geçişini tetikler.
 * @param {string} name - panel adı (örn. 'hisseler')
 * @param {Element} [btnEl] - aktif class verilecek buton
 */
function _switchTab(name, btnEl) {
  switchTab(name, btnEl);                        // ui.js: DOM günceller
  if (name === 'sinyaller') renderSinyalGecmisi();
  if (name === 'portfoy')   renderPortfoy();
  if (name === 'admin')     loadAdminPanel();
  if (name === 'sozluk')    _loadSozluk();
  if (name === 'haberler')  _loadHaberler();
}

// ─────────────────────────────────────────────
// DOM HAZIR — TÜM EVENT LISTENER'LAR
// Tüm statik buton ve kontrol bağlamaları burada.
// Dinamik olarak oluşturulan elemanlar için
// window._uiCallbacks köprüsü kullanılır.
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── Tab navigasyonu (data-tab delegation) ──
  el('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    _switchTab(btn.dataset.tab, btn);
  });

  // ── Hisse filtre chip'leri (data-filter delegation) ──
  document.querySelectorAll('.chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ aktifFilter: btn.dataset.filter });
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderHisseler();
    });
  });

  // ── Modal kapat (data-modal-close delegation) ──
  document.addEventListener('click', (e) => {
    const id = e.target.dataset.modalClose;
    if (id) closeModal(id);
    // Overlay'e tıklama ile kapat
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('show');
    }
  });

  // ── Auth ──
  el('btnGoogleLogin')?.addEventListener('click', () => window.googleLogin());
  el('btnLogout')?.addEventListener('click', () => window.logout());

  // ── Topbar ──
  el('btnGuncelle')?.addEventListener('click', () => window.verileriGuncelle());

  // ── SPK uyarı bant kapatma ──
  el('btnSpkKapat')?.addEventListener('click', () => {
    el('spkUyari').style.display = 'none';
  });

  // ── Hisse arama ──
  el('searchInput')?.addEventListener('input', () => renderHisseler());
  el('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.hisseAra(e.target.value);
  });
  el('btnTakibiKaldir')?.addEventListener('click', () => window.takibiKaldir());

  // ── Sinyal geçmişi ──
  el('dogrulamaSuresi')?.addEventListener('change', (e) => {
    setState({ dogrulamaGun: parseInt(e.target.value) });
    renderSinyalGecmisi();
    showToast(`Doğrulama süresi ${state.dogrulamaGun} gün olarak ayarlandı`);
  });
  el('btnSinyalleriGuncelle')?.addEventListener('click', () => window.sinyalleriGuncelle());

  // ── Haberler ──
  el('btnHaberleriYenile')?.addEventListener('click', () => _haberleriYenile());

  // ── Sözlük ──
  el('sozlukSearch')?.addEventListener('input', (e) => {
    renderSozluk(sozlukVeriler, e.target.value);
  });
  el('btnTerimiSor')?.addEventListener('click', () => {
    const q = el('sozlukSearch').value.trim();
    if (!q) { showToast('Önce terim yaz!', 'error'); return; }
    terimSorAPI(q);
  });
  el('btnPushGonder')?.addEventListener('click', () => openModal('pushModal'));

  // ── Push modal ──
  el('btnPushGonderOnayla')?.addEventListener('click', () => window.pushGonderOnay());

  // ── Portföy modal ──
  el('btnPortfoyKaydet')?.addEventListener('click', () => window.portfoyKaydet());

  // ── Hisse detay modal ──
  el('detayAiBtn')?.addEventListener('click', () => window.hisseAiAnalizEt());
  el('detayTakipBtn')?.addEventListener('click', () => window.detayTakipToggle());
  el('detayPortfoyEkleBtn')?.addEventListener('click', () => {
    if (state.detayKod) portfoyModalAc(state.detayKod, hisseAdi(state.detayKod));
  });

  // ── Admin ──
  el('btnKullaniciEkle')?.addEventListener('click', () => openModal('addUserModal'));
  el('btnKullaniciEkleOnayla')?.addEventListener('click', () => window.kullaniciEkle());
  el('btnSaveApiKey')?.addEventListener('click', () => window.saveApiKey());
  el('btnMukerrerTemizle')?.addEventListener('click', () => window.mukerrerTemizle());
  el('btnTokenYenile')?.addEventListener('click', () => window.loadTokenIstatistik());
  el('btnGunSonuOzet')?.addEventListener('click', () => window.gunSonuOzetOlustur());

});

// ─────────────────────────────────────────────
// VERİ GÜNCELLEME DÖNGÜSÜ
// ─────────────────────────────────────────────

window.verileriGuncelle = async () => {
  showLoading('Veriler çekiliyor...');
  setStatus('loading', 'Güncelleniyor...');

  // 0. Piyasa genel verisi
  setLoadingMsg('Piyasa genel verisi çekiliyor...');
  await _piyasaVerisiCek();

  // 1. Tüm hisseler — anlık fiyatlar
  setLoadingMsg('Hisse verileri çekiliyor...');
  try {
    const hisseler = await fetchTumHisseFiyatlari();
    hisseler.forEach(h => {
      const kod    = h.KOD || h.kod || h.SEMBOL;
      if (!kod) return;
      const fiyat  = parseFloat(h.KAPANIS || h.SON   || h.kapanis || 0);
      const degisim = parseFloat(h.YUZDE  || h.yuzde || 0);
      const hacim  = parseFloat(h.HACIM   || h.hacim  || 0);
      if (fiyat > 0) {
        if (!state.veriler[kod]) state.veriler[kod] = {};
        state.veriler[kod].fiyat   = +fiyat.toFixed(2);
        state.veriler[kod].degisim = +degisim.toFixed(2);
        state.veriler[kod].hacim   = hacim;
        state.veriler[kod].ts      = Date.now();
        state.veriler[kod].sinyal  = state.veriler[kod].sinyal || 'BEKLE';
      }
    });
    setLoadingMsg(`${hisseler.length} hisse fiyatı alındı...`);
  } catch (e) { console.error('Fiyat çekme hatası:', e); }

  renderHisseler();

  // 2. Takip edilenler — geçmiş veri (RSI/MACD)
  const takipKodlar = [...state.takipEdilen];
  if (takipKodlar.length > 0) {
    setLoadingMsg('Teknik analiz için geçmiş veri çekiliyor...');
    const piyasaYon = state.piyasaVerisi.yon;
    const sonuclar  = await fetchTopluYahoo(takipKodlar, piyasaYon);
    for (const [sembol, v] of Object.entries(sonuclar)) {
      state.veriler[sembol] = { ...state.veriler[sembol], ...v };
    }
  }

  renderHisseler();

  // 3. AI portföy analizi
  let aiYorum = '';
  if (aiGerekliMi()) {
    setLoadingMsg('AI analiz yapılıyor...');
    try {
      aiYorum = await Promise.race([
        aiPortfoyAnalizYap({
          key:           aktifKey(),
          veriler:       state.veriler,
          takipEdilen:   state.takipEdilen,
          sinyalGecmisi: state.sinyalGecmisi,
          piyasaVerisi:  state.piyasaVerisi,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ]).catch(() => '');
    } catch (_) {}
  }

  if (aiYorum) aiCalistiKaydet();

  await sinyalKaydet({
    db, currentUser: state.currentUser,
    veriler:     state.veriler,
    takipEdilen: state.takipEdilen,
    aiYorum,
  });

  await saveUserData({
    db, currentUser: state.currentUser,
    takipEdilen: state.takipEdilen,
    portfoy:     state.portfoy,
    veriler:     state.veriler,
  });

  hideLoading();
  setStatus('live', 'Canlı');
  renderDashboard();
  renderPortfoy();
  renderHisseler();
  renderSummary();
  setState({ haberlerYuklendi: false }); // haberler bir sonraki açılışta yenilensin
  showToast(`${Object.keys(state.veriler).filter(k => state.veriler[k].fiyat).length} hisse güncellendi ✓`);
};

// ─────────────────────────────────────────────
// PİYASA VERİSİ (ÖZEL)
// ─────────────────────────────────────────────

async function _piyasaVerisiCek() {
  try {
    const data = await fetchPiyasaVerisi();
    if (!data) return;

    const pv = { ...state.piyasaVerisi };

    const xu100 = data['^XU100']?.chart?.result?.[0];
    if (xu100) {
      const f = xu100.meta.regularMarketPrice || 0;
      const o = xu100.meta.chartPreviousClose  || 0;
      const d = o > 0 ? +((f - o) / o * 100).toFixed(2) : 0;
      pv.xu100 = { fiyat: f, degisim: d };
      pv.yon   = d;
    }

    const usdtry = data['USDTRY=X']?.chart?.result?.[0];
    if (usdtry) {
      const f = usdtry.meta.regularMarketPrice || 0;
      const o = usdtry.meta.chartPreviousClose  || 0;
      pv.usdtry = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    const eurtry = data['EURTRY=X']?.chart?.result?.[0];
    if (eurtry) {
      const f = eurtry.meta.regularMarketPrice || 0;
      const o = eurtry.meta.chartPreviousClose  || 0;
      pv.eurtry = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    setState({ piyasaVerisi: pv });
    renderPiyasaKartlari();
  } catch (e) { console.error('Piyasa verisi hatası:', e); }
}

// ─────────────────────────────────────────────
// SİNYAL DOĞRULAMA
// ─────────────────────────────────────────────

async function _sinyalleriDogrula() {
  state.sinyalGecmisi = await sinyalleriDogrula({
    db,
    sinyalGecmisi: state.sinyalGecmisi,
    dogrulamaGun:  state.dogrulamaGun,
    piyasaYon:     state.piyasaVerisi.yon,
  });
}

window.sinyalleriGuncelle = async () => {
  showLoading('Sinyal sonuçları kontrol ediliyor...');
  await _sinyalleriDogrula();
  hideLoading();
  renderSinyalGecmisi();
  renderSummary();
  showToast('Sinyal sonuçları güncellendi ✓');
};

// dogrulamaSuresiDegis → DOMContentLoaded içindeki listener yönetiyor

// ─────────────────────────────────────────────
// HİSSE TAKİP
// ─────────────────────────────────────────────

function toggleTakip(k) {
  if (state.takipEdilen.has(k)) {
    if (!confirm(`${k} takipten çıkarılsın mı?`)) return;
    state.takipEdilen.delete(k);
    delete state.veriler[k];
  } else {
    state.takipEdilen.add(k);
  }
  saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
  renderHisseler();
  renderSummary();
}

window.takibiKaldir = () => {
  state.takipEdilen.clear();
  saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
  renderHisseler();
  renderSummary();
};

window.filterHisseler = () => renderHisseler();
window.renderHisseler = () => renderHisseler();

// setFilter → DOMContentLoaded içindeki data-filter listener yönetiyor

window.hisseAra = async (kod) => {
  kod = kod.trim().toUpperCase();
  if (!kod) return;
  if (BIST.find(b => b[0] === kod)) { renderHisseler(); return; }

  showToast(kod + ' aranıyor...');
  try {
    const v = await fetchYahoo(kod, state.piyasaVerisi.yon);
    if (v) {
      if (!BIST.find(b => b[0] === kod)) BIST.push([kod, kod + ' (Özel)']);
      state.veriler[kod] = v;
      showToast(kod + ' bulundu ve eklendi ✓');
      renderHisseler();
    } else {
      showToast(kod + ' bulunamadı', 'error');
    }
  } catch (e) { showToast('Arama hatası: ' + e.message, 'error'); }
};

// ─────────────────────────────────────────────
// PORTFÖY
// ─────────────────────────────────────────────

window.portfoyModal = (k, a) => portfoyModalAc(k, a);

window.portfoyKaydet = async () => {
  const adet  = Number(el('pAdet').value);
  const fiyat = Number(el('pFiyat').value);
  const tarih = el('pTarih').value;
  const k     = state.portfoyKod;
  if (!adet || !fiyat) { showToast('Adet ve fiyat zorunlu!', 'error'); return; }

  state.portfoy[k] = { adet, alisFiyati: fiyat, alisTarihi: tarih, ad: hisseAdi(k) };
  if (!state.takipEdilen.has(k)) state.takipEdilen.add(k);

  await saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
  closeModal('portfoyModal');
  renderHisseler();
  renderPortfoy();
  showToast(k + ' portföye eklendi ✓');
};

async function portfoyCikar(k) {
  if (!confirm(k + ' portföyden çıkarılsın mı?')) return;
  delete state.portfoy[k];
  await saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
  renderPortfoy();
  showToast(k + ' portföyden çıkarıldı');
}

window.closeModal = closeModal;

// ─────────────────────────────────────────────
// HİSSE DETAY PANELİ
// ─────────────────────────────────────────────

async function hisseDetayAc(kod) {
  setState({ detayKod: kod });
  renderHisseDetay(kod);

  // Daha önce analiz yapıldı mı?
  if (state.currentUser) {
    hisseAnalizCache({ db, currentUser: state.currentUser, kod }).then(cached => {
      if (cached) {
        renderHisseAnalizSonucu(cached);
        el('detayAiBtn').textContent = '⬡ Yeniden Analiz Et';
      }
    }).catch(() => {});
  }

  // Gelişmiş indikatörler yoksa çek
  if (!state.veriler[kod]?.bollinger) {
    el('detayAiIcerik').innerHTML = '<span style="color:var(--muted);font-size:0.78rem">⏳ Teknik veriler yükleniyor...</span>';
    try {
      const v = await fetchYahoo(kod, state.piyasaVerisi.yon);
      if (v) {
        state.veriler[kod] = { ...state.veriler[kod], ...v };
        renderDetayTeknik(kod);
      }
    } catch (_) {}
    el('detayAiIcerik').innerHTML = '<span style="color:var(--muted)">Analiz için butona bas...</span>';
  }
}

window.hisseAiAnalizEt = async () => {
  const kod = state.detayKod;
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }

  const btn = el('detayAiBtn');
  btn.disabled    = true;
  btn.textContent = '⏳ Analiz ediliyor...';
  el('detayAiIcerik').innerHTML = '<div style="color:var(--muted);font-size:0.8rem">Claude analiz yapıyor...</div>';

  try {
    const analiz = await aiHisseAnalizEt({
      key,
      kod,
      veri:          state.veriler[kod],
      piyasaVerisi:  state.piyasaVerisi,
      sinyalGecmisi: state.sinyalGecmisi,
      portfoy:       state.portfoy,
      haberlerData:  state.haberlerData,
      bistListesi:   BIST,
    });

    if (analiz) {
      await hisseAnalizKaydet({ db, currentUser: state.currentUser, kod, analiz });
      renderHisseAnalizSonucu(analiz);
      btn.textContent = '⬡ Yeniden Analiz Et';
    } else {
      el('detayAiIcerik').innerHTML = '<div style="color:var(--red)">Analiz alınamadı, tekrar dene</div>';
      btn.textContent = '⬡ AI ile Analiz Et';
    }
  } catch (e) {
    el('detayAiIcerik').innerHTML = '<div style="color:var(--red)">Hata: ' + e.message + '</div>';
    btn.textContent = '⬡ AI ile Analiz Et';
  }
  btn.disabled = false;
};

window.detayTakipToggle = () => {
  const kod = state.detayKod;
  if (!kod) return;
  toggleTakip(kod);
  const btn = el('detayTakipBtn');
  if (state.takipEdilen.has(kod)) { btn.textContent = '★ Takipte'; btn.style.color = 'var(--accent)'; }
  else                             { btn.textContent = '☆ Takibe Al'; btn.style.color = ''; }
  showToast(state.takipEdilen.has(kod) ? kod + ' takibe alındı ✓' : kod + ' takipten çıkarıldı');
};

// ─────────────────────────────────────────────
// HABERLER
// ─────────────────────────────────────────────

async function _loadHaberler() {
  if (state.haberlerYuklendi) return;
  el('haberListesi').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div><div>Haberler yükleniyor...</div></div>';
  await _haberleriYenile();
}

window.haberleriYenile = () => _haberleriYenile();

async function _haberleriYenile() {
  el('haberListesi').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div><div>Haberler yükleniyor...</div></div>';
  try {
    const haberler = await fetchHaberler();
    haberler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
    setState({ haberlerData: haberler, haberlerYuklendi: true });
    renderHaberler();
    showToast(`${haberler.length} haber yüklendi ✓`);

    // Mevcut analizleri Firestore'dan yükle
    if (state.currentUser) {
      haberler.forEach(async (h, idx) => {
        try {
          const hash  = haberHashOlustur(h.baslik);
          const cache = await haberAnalizCache({ db, currentUser: state.currentUser, haberHash: hash });
          if (cache) {
            renderHaberAnaliz(idx, cache);
            el('analiz-btn-' + idx)?.remove();
          }
        } catch (_) {}
      });
    }
  } catch (e) {
    el('haberListesi').innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted)">
      <div style="color:var(--red);margin-bottom:0.5rem">Haberler yüklenemedi</div>
      <div style="font-size:0.78rem">${e.message}</div>
      <button class="btn primary" onclick="haberleriYenile()" style="margin-top:1rem">Tekrar Dene</button>
    </div>`;
  }
}

async function tekHaberAnalizEt(idx) {
  const h   = state.haberlerData[idx];
  if (!h) return;
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }

  const btn     = el('analiz-btn-' + idx);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analiz ediliyor...'; }

  const hash  = haberHashOlustur(h.baslik);
  const cache = await haberAnalizCache({ db, currentUser: state.currentUser, haberHash: hash }).catch(() => null);
  if (cache) { renderHaberAnaliz(idx, cache); btn?.remove(); return; }

  try {
    const analiz = await aiHaberAnalizEt({ key, haber: h, takipEdilen: state.takipEdilen });
    if (analiz) {
      const kayit = await haberAnalizKaydet({
        db, currentUser: state.currentUser,
        haberHash: hash, analiz, haber: h,
        takipEdilen: state.takipEdilen,
      });
      renderHaberAnaliz(idx, kayit);
      analiz.hisseler?.forEach(x => {
        if (state.takipEdilen.has(x.kod)) {
          if      (x.etki === 'olumsuz') showToast('⚠️ ' + x.kod + ' olumsuz etkilenebilir!', 'error');
          else if (x.etki === 'olumlu')  showToast('💡 ' + x.kod + ' olumlu etkilenebilir!');
        }
      });
    }
    btn?.remove();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '⬡ AI Analiz'; }
    showToast('Analiz hatası: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────
// SÖZLÜK
// ─────────────────────────────────────────────

async function _loadSozluk() {
  if (state.isAdmin) {
    el('adminSozlukBtns').style.display  = 'flex';
    el('adminSozlukStats').style.display = 'block';
    loadTerimIstatistik();
  }
  try {
    sozlukVeriler = await loadSozluk({ db });
  } catch (e) { console.error('Sözlük yükleme hatası:', e); }
  renderPopularTerimler();
  renderSozluk(sozlukVeriler);
}

function toggleTerim(id) {
  const t = sozlukVeriler.find(x => x.id === id);
  if (t) { t.acik = !t.acik; renderSozluk(sozlukVeriler); }
}

window.filterTerimler = () => {
  const q = el('sozlukSearch').value;
  renderSozluk(sozlukVeriler, q);
};

window.terimiSor = () => {
  const q = el('sozlukSearch').value.trim();
  if (!q) { showToast('Önce terim yaz!', 'error'); return; }
  terimSorAPI(q);
};

async function terimSorAPI(terim) {
  const key = aktifKey();
  if (!key) { showToast('Sistem şu an kullanılamıyor.', 'error'); return; }

  const mevcut = sozlukVeriler.find(t => t.terim.toLowerCase() === terim.toLowerCase());
  if (mevcut) {
    showToast(`"${terim}" zaten sözlükte var!`);
    await sozlukSorulmaSayisiArtir({ db, mevcutId: mevcut.id, mevcutSorulma: mevcut.sorulma || 1 });
    mevcut.sorulma = (mevcut.sorulma || 1) + 1;
    renderSozluk(sozlukVeriler);
    return;
  }

  showLoading(`"${terim}" için Claude açıklama hazırlıyor...`);
  try {
    const aciklama = await aiTerimAcikla({ key, terim });
    if (!aciklama) { hideLoading(); showToast('Açıklama alınamadı', 'error'); return; }

    const yeni = await sozlukTerimKaydet({ db, terim, aciklama, currentUser: state.currentUser });
    sozlukVeriler.unshift(yeni);
    hideLoading();
    renderSozluk(sozlukVeriler);
    showToast(`"${terim}" sözlüğe eklendi ✓`);
  } catch (e) { hideLoading(); showToast('Hata: ' + e.message, 'error'); }
}

async function loadTerimIstatistik() {
  const container = el('terimIstatistik');
  if (!container) return;
  try {
    const snap    = await getDocs(query(collection(db, 'sozluk'), orderBy('sorulma', 'desc'), limit(10)));
    const terimler = snap.docs.map(d => d.data());
    container.innerHTML = terimler.map((t, i) =>
      `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--border)">
        <span class="mono" style="color:var(--muted);font-size:0.8rem">${i + 1}.</span>
        <span style="flex:1;font-size:0.82rem">${t.terim}</span>
        <span class="pill al">${t.sorulma}x</span>
        <button class="btn" onclick="window._pushTerimByData('${t.terim}','${(t.aciklama || '').substring(0, 50)}')" style="font-size:0.7rem;padding:2px 8px">📢 Push</button>
      </div>`
    ).join('');
  } catch (e) { console.error(e); }
}

function pushTerimGonderById(id) {
  const t = sozlukVeriler.find(x => x.id === id);
  if (!t) return;
  el('pushBaslik').value = `📚 Bugünün Terimi: ${t.terim}`;
  el('pushMesaj').value  = t.aciklama;
  openModal('pushModal');
}

window._pushTerimByData = (terim, aciklama) => {
  el('pushBaslik').value = `📚 Bugünün Terimi: ${terim}`;
  el('pushMesaj').value  = aciklama + '...';
  openModal('pushModal');
};

// ─────────────────────────────────────────────
// PUSH MESAJI
// ─────────────────────────────────────────────

window.pushGonder = () => openModal('pushModal');

window.pushGonderOnay = async () => {
  const baslik = el('pushBaslik').value;
  const mesaj  = el('pushMesaj').value;
  if (!baslik || !mesaj) { showToast('Başlık ve mesaj zorunlu!', 'error'); return; }
  try {
    await pushMesajGonder({ db, currentUser: state.currentUser, baslik, mesaj });
    closeModal('pushModal');
    showToast('Push mesajı gönderildi! ✓');
    showPushBildirim(baslik, mesaj);
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
};

// ─────────────────────────────────────────────
// ADMIN PANELİ
// ─────────────────────────────────────────────

async function loadAdminPanel() {
  if (!state.isAdmin) return;
  loadTokenIstatistik();
  _loadHaberAnalizleri();

  try {
    const snap  = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    el('adminTotalUser').textContent = users.length;

    const config = await getDoc(doc(db, 'config', 'global'));
    if (config.exists()) el('adminApiKey').value = config.data().anthropicKey || '';

    el('kullaniciListesi').innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--border)">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--accent);flex-shrink:0">${(u.name || u.email)[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis">${u.name || '—'}</div>
          <div style="font-size:0.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis">${u.email}</div>
        </div>
        <span class="pill ${u.active ? 'al' : 'bekle'}">${u.active ? 'Aktif' : 'Pasif'}</span>
        <span class="pill bekle" style="font-size:0.6rem">${u.plan || 'web'}</span>
        ${!u.isAdmin ? `<button class="btn danger" onclick="kullanicisil('${u.id}')" style="font-size:0.7rem;padding:2px 6px">Sil</button>` : ''}
      </div>`).join('');
  } catch (e) { console.error('Admin yükleme hatası:', e); }
}

window.showAddUser = () => openModal('addUserModal');

window.kullaniciEkle = async () => {
  const name   = el('newUserName').value.trim();
  const email  = el('newUserEmail').value.trim();
  const apiKey = el('newUserApiKey').value.trim();
  const plan   = el('newUserPlan').value;
  if (!email) { showToast('E-posta zorunlu!', 'error'); return; }
  const uid = btoa(email).replace(/=/g, '');
  try {
    await setDoc(doc(db, 'users', uid), {
      email, name, apiKey, plan, active: true,
      isAdmin: false, createdAt: serverTimestamp(),
      takipEdilen: [], portfoy: {}, veriler: {},
    });
    closeModal('addUserModal');
    showToast(email + ' eklendi ✓');
    loadAdminPanel();
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
};

window.kullanicisil = async (uid) => {
  if (!confirm('Kullanıcı silinsin mi?')) return;
  try {
    await deleteDoc(doc(db, 'users', uid));
    showToast('Kullanıcı silindi');
    loadAdminPanel();
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
};

window.saveApiKey = async () => {
  const key = el('adminApiKey').value.trim();
  setState({ havuzKey: key, anthropicKey: key });
  await apiSaveApiKey({ db, currentUser: state.currentUser, key });
  showToast('API anahtarı kaydedildi ✓');
  el('apiStatus').textContent = key ? '✓ Tanımlı' : 'Tanımlı değil';
  el('apiStatus').style.color = key ? 'var(--accent)' : 'var(--muted)';
};

window.mukerrerTemizle = async () => {
  if (!confirm('Mükerrer sinyal kayıtları temizlensin mi?')) return;
  showLoading('Mükerrer kayıtlar temizleniyor...');
  try {
    const silinen = await mukerrerSinyalleriTemizle({ db });
    hideLoading();
    showToast(`${silinen} mükerrer kayıt silindi ✓`);
    state.sinyalGecmisi = await loadSinyalGecmisi({ db, currentUser: state.currentUser });
    renderSinyalGecmisi();
  } catch (e) { hideLoading(); showToast('Hata: ' + e.message, 'error'); }
};

window.loadTokenIstatistik = async () => {
  const container = el('tokenIstatistik');
  if (!container) return;
  try {
    const ay   = new Date().toISOString().slice(0, 7);
    el('tokenAySec').textContent = ay;
    const snap = await getDocs(collection(db, 'tokenKullanim'));
    const buAy = snap.docs.map(d => d.data()).filter(d => d.ay === ay).sort((a, b) => b.toplamToken - a.toplamToken);

    if (buAy.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Bu ay henüz AI kullanımı yok</div>';
      return;
    }
    const toplamToken  = buAy.reduce((s, d) => s + d.toplamToken, 0);
    const toplamMaliyet = buAy.reduce((s, d) => s + d.maliyet, 0);
    const toplamIstek  = buAy.reduce((s, d) => s + d.istekSayisi, 0);

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
        <div class="card" style="text-align:center"><div class="card-title">Toplam Token</div><div class="card-value mono" style="font-size:1.1rem">${toplamToken.toLocaleString()}</div></div>
        <div class="card" style="text-align:center"><div class="card-title">Tahmini Maliyet</div><div class="card-value green mono" style="font-size:1.1rem">$${toplamMaliyet.toFixed(3)}</div></div>
        <div class="card" style="text-align:center"><div class="card-title">AI İstek</div><div class="card-value mono" style="font-size:1.1rem">${toplamIstek}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.78rem">
        <thead><tr>
          <th style="text-align:left;padding:0.5rem;color:var(--muted);border-bottom:1px solid var(--border)">Kullanıcı</th>
          <th style="text-align:right;padding:0.5rem;color:var(--muted);border-bottom:1px solid var(--border)">Token</th>
          <th style="text-align:right;padding:0.5rem;color:var(--muted);border-bottom:1px solid var(--border)">İstek</th>
          <th style="text-align:right;padding:0.5rem;color:var(--muted);border-bottom:1px solid var(--border)">Maliyet</th>
        </tr></thead>
        <tbody>${buAy.map(d => `<tr>
          <td style="padding:0.5rem;border-bottom:1px solid var(--border)">${d.ad || d.email}</td>
          <td style="padding:0.5rem;border-bottom:1px solid var(--border);text-align:right;font-family:var(--mono)">${d.toplamToken.toLocaleString()}</td>
          <td style="padding:0.5rem;border-bottom:1px solid var(--border);text-align:right;font-family:var(--mono)">${d.istekSayisi}</td>
          <td style="padding:0.5rem;border-bottom:1px solid var(--border);text-align:right;font-family:var(--mono);color:var(--accent)">$${d.maliyet.toFixed(4)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch (e) { container.innerHTML = '<div style="color:var(--red)">Yükleme hatası: ' + e.message + '</div>'; }
};

async function _loadHaberAnalizleri() {
  const container = el('haberAnalizListesi');
  if (!container || !state.isAdmin) return;
  try {
    const snap     = await getDocs(query(collection(db, 'haberAnalizleri'), orderBy('tarih', 'desc'), limit(50)));
    const analizler = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (analizler.length === 0) { container.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:1rem">Henüz analiz yok</div>'; return; }
    container.innerHTML = analizler.map(a => `
      <div style="padding:0.75rem;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:0.4rem">
          <div style="font-size:0.82rem;font-weight:500;flex:1">${a.haberBaslik || '—'}</div>
          <span style="font-size:0.68rem;color:var(--muted);font-family:var(--mono);white-space:nowrap">${new Date(a.tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
          <span style="font-size:0.72rem;color:var(--accent)">👤 ${a.kullaniciAd || '—'}</span>
          ${a.hisseler?.slice(0, 5).map(x => `<span style="font-size:0.68rem;padding:1px 6px;border-radius:4px;background:${x.etki === 'olumlu' ? 'rgba(0,229,160,0.12)' : x.etki === 'olumsuz' ? 'rgba(255,69,96,0.12)' : 'rgba(255,209,102,0.12)'};color:${x.etki === 'olumlu' ? 'var(--accent)' : x.etki === 'olumsuz' ? 'var(--red)' : 'var(--yellow)'};font-family:var(--mono)">${x.etki === 'olumlu' ? '🟢' : x.etki === 'olumsuz' ? '🔴' : '🟡'} ${x.kod}</span>`).join('') || ''}
        </div>
        ${a.yorum ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:0.4rem;line-height:1.5">${a.yorum}</div>` : ''}
      </div>`).join('');
  } catch (e) { if (container) container.innerHTML = `<div style="color:var(--red);font-size:0.8rem">${e.message}</div>`; }
}

window.gunSonuOzetOlustur = async () => {
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }
  showLoading('Gün sonu özeti hazırlanıyor...');
  try {
    const snap     = await getDocs(query(collection(db, 'haberAnalizleri'), orderBy('tarih', 'desc'), limit(100)));
    const bugun    = new Date().toLocaleDateString('tr-TR');
    const analizler = snap.docs.map(d => d.data()).filter(a => new Date(a.tarih).toLocaleDateString('tr-TR') === bugun);
    if (analizler.length === 0) { hideLoading(); showToast('Bugün henüz analiz yapılmamış!', 'error'); return; }
    const { text } = await aiGunSonuOzeti({ key, analizler });
    hideLoading();
    if (text) {
      el('pushBaslik').value = `📊 ${bugun} Piyasa Özeti`;
      el('pushMesaj').value  = text;
      openModal('pushModal');
    }
  } catch (e) { hideLoading(); showToast('Hata: ' + e.message, 'error'); }
};

// ─────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────
setTimeout(() => el('loadingScreen').classList.add('hide'), 2000);
