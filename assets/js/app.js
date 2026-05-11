// ══════════════════════════════════════════════
// HisseMatik — Ana Orkestrasyon
// assets/js/app.js
// ══════════════════════════════════════════════

import {
  auth, db, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp,
  enableNetwork, disableNetwork,
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
  saveUserApiKey,
  loadUserApiKey,
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
  setApiToast,
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

setApiToast(showToast);

// ─────────────────────────────────────────────
// SÖZLÜK LOCAL STATE
// ─────────────────────────────────────────────
let sozlukVeriler = [];

// ─────────────────────────────────────────────
// UI CALLBACK KÖPRÜSÜ
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
// OFFLINE / ONLINE BANNER
// ─────────────────────────────────────────────

function _offlineBannerGoster() {
  let banner = el('offlineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id        = 'offlineBanner';
    banner.innerHTML = '⚠️ İnternet bağlantısı yok — veriler güncellenemiyor.';
    Object.assign(banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
      background: 'var(--red, #ff4560)', color: '#fff',
      padding: '0.6rem 1rem', fontSize: '0.82rem',
      textAlign: 'center', fontWeight: '500',
    });
    document.body.prepend(banner);
  }
  banner.style.display = 'block';
  disableNetwork(db).catch(() => {});
}

function _offlineBannerGizle() {
  const banner = el('offlineBanner');
  if (banner) banner.style.display = 'none';
  enableNetwork(db).catch(() => {});
}

window.addEventListener('offline', _offlineBannerGoster);
window.addEventListener('online', () => {
  _offlineBannerGizle();
  showToast('Bağlantı yeniden sağlandı ✓', 'success');
  if (state.currentUser) window.verileriGuncelle();
});

if (!navigator.onLine) _offlineBannerGoster();

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
  const isAdmin = ADMIN_EMAILS.includes(user.email);
  let userSnap;
  let userRef;
  try {
    userRef  = doc(db, 'users', user.uid);
    userSnap = await getDoc(userRef);
  } catch (e) {
    showToast('Firebase bağlantı hatası: ' + (e?.message || 'Bilinmeyen hata'), 'error');
    el('loadingScreen').classList.add('hide');
    el('authScreen').style.display = 'flex';
    return;
  }

  // Kayıt yoksa otomatik oluştur — onay bekliyor
  if (!userSnap.exists() && !isAdmin) {
    try {
      await setDoc(userRef, {
        email:       user.email,
        name:        user.displayName || '',
        plan:        'free',
        active:      false,
        isAdmin:     false,
        createdAt:   serverTimestamp(),
        takipEdilen: [],
        portfoy:     {},
        veriler:     {},
        apiKeySet:   false,
      });
    } catch (e) {
      showToast('Kayıt oluşturulamadı: ' + (e?.message || 'Hata'), 'error');
    }
    showToast('Erişim talebiniz alındı. Admin onayı bekleniyor.', 'error');
    await signOut(auth);
    el('authScreen').style.display = 'flex';
    return;
  }

  // Kayıt var ama onaysız
  if (!isAdmin && !userSnap.data()?.active) {
    showToast('Hesabınız henüz onaylanmadı. Lütfen bekleyin.', 'error');
    await signOut(auth);
    el('authScreen').style.display = 'flex';
    return;
  }

  const userDoc = userSnap.exists() ? userSnap.data() : {};

  // Admin kaydı yoksa oluştur
  if (isAdmin && !userSnap.exists()) {
    try {
      await setDoc(userRef, {
        email: user.email, name: user.displayName || 'Admin',
        isAdmin: true, plan: 'full', active: true,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      showToast('Admin kaydı oluşturulamadı: ' + e.message, 'error');
    }
  }

  // ── Kullanıcının şifreli API key'ini çöz ──
  // encryptedApiKey varsa AES-GCM ile çözülür,
  // plaintext sadece bellekte (state.anthropicKey) tutulur.
  let anthropicKey = '';
  if (userDoc.encryptedApiKey) {
    anthropicKey = await loadUserApiKey({
      uid:          user.uid,
      encryptedKey: userDoc.encryptedApiKey,
    });
  }

  // State'i doldur
  setState({
    currentUser:  user,
    userDoc,
    isAdmin,
    anthropicKey,                              // havuzKey YOK — sadece kişisel key
    takipEdilen:  new Set(userDoc.takipEdilen || []),
    portfoy:      userDoc.portfoy  || {},
    veriler:      userDoc.veriler  || {},
  });

  // UI
  el('authScreen').style.display = 'none';
  el('appShell').style.display   = 'block';
  renderTopbar();

  if (isAdmin) loadAdminPanel();

  // API key durumunu topbar'da göster
  _apiKeyDurumGoster();

  // İlk yüklemeler
  await _piyasaVerisiCek();
  await checkPushMesajlar({ db, currentUser: user, onMesaj: showPushBildirim });

  try {
    state.sinyalGecmisi = await loadSinyalGecmisi({ db, currentUser: user });
    await _sinyalleriDogrula();
  } catch (e) {
    showToast('Sinyal geçmişi yüklenemedi — Firebase bağlantısını kontrol edin.', 'error');
  }

  // Tam BIST listesini proxy'den çek
  try {
    const bistRes  = await fetch('https://hissematik-proxy.ugurserkan.workers.dev/?bistliste=1');
    const bistData = await bistRes.json();
    if (bistData?.hisseler?.length > 0) {
      const mevcutKodlar = new Set(BIST.map(([k]) => k));
      bistData.hisseler.forEach(({ kod, ad }) => {
        if (!mevcutKodlar.has(kod)) BIST.push([kod, ad]);
      });
    }
  } catch (_) {}

  renderHisseler();
  renderDashboard();
  renderPortfoy();
  renderSummary();
});

// ─────────────────────────────────────────────
// API KEY DURUM GÖSTERGESİ
// Kullanıcının key'i yoksa topbar'da uyarı göster
// ─────────────────────────────────────────────

function _apiKeyDurumGoster() {
  const key = aktifKey();
  const apiStatusEl = el('apiStatus');
  if (apiStatusEl) {
    apiStatusEl.textContent = key ? '✓ Tanımlı' : '⚠ Tanımlı değil';
    apiStatusEl.style.color = key ? 'var(--accent)' : 'var(--red)';
  }
  // Key yoksa AI butonlarını gizlemek yerine mesaj veriyoruz (butonlar kendi kontrolünü yapıyor)
}

// ─────────────────────────────────────────────
// TAB YÖNETİMİ
// ─────────────────────────────────────────────

async function _switchTab(name, btn) {
  switchTab(name, btn);
  if (name === 'haberler') await _loadHaberler();
  if (name === 'sozluk')   await _loadSozluk();
  if (name === 'sinyaller') renderSinyalGecmisi();
  if (name === 'portfoy')  renderPortfoy();
}

// ─────────────────────────────────────────────
// VERİ GÜNCELLEME DÖNGÜSÜ
// ─────────────────────────────────────────────

window.verileriGuncelle = async () => {
  if (!navigator.onLine) {
    showToast('İnternet bağlantısı yok. Güncelleme yapılamadı.', 'error');
    return;
  }

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
      const kod     = h.KOD || h.kod || h.SEMBOL;
      if (!kod) return;
      const fiyat   = parseFloat(h.KAPANIS || h.SON   || h.kapanis || 0);
      const degisim = parseFloat(h.YUZDE   || h.yuzde || 0);
      const hacim   = parseFloat(h.HACIM   || h.hacim  || 0);
      if (fiyat > 0) {
        if (!state.veriler[kod]) state.veriler[kod] = {};
        state.veriler[kod].fiyat   = +fiyat.toFixed(2);
        state.veriler[kod].degisim = +degisim.toFixed(2);
        state.veriler[kod].hacim   = hacim;
        state.veriler[kod].ts      = Date.now();
        state.veriler[kod].sinyal  = state.veriler[kod].sinyal || 'BEKLE';
      }
    });
    setLoadingMsg(hisseler.length + ' hisse fiyatı alındı...');
  } catch (e) {
    console.error('Fiyat çekme hatası:', e);
    showToast('Hisse fiyatları alınamadı: ' + (e?.message || 'Bağlantı hatası'), 'error');
  }

  renderHisseler();

  // 2. Takip edilenler — geçmiş veri (RSI/MACD)
  const takipKodlar = [...state.takipEdilen];
  if (takipKodlar.length > 0) {
    setLoadingMsg('Teknik analiz için geçmiş veri çekiliyor...');
    const piyasaYon = state.piyasaVerisi.yon;
    try {
      const sonuclar = await fetchTopluYahoo(takipKodlar, piyasaYon);
      for (const [sembol, v] of Object.entries(sonuclar)) {
        state.veriler[sembol] = { ...state.veriler[sembol], ...v };
      }
    } catch (e) {
      showToast('Teknik veriler kısmen alınamadı.', 'error');
    }
  }

  renderHisseler();

  // 3. AI portföy analizi
  let aiYorum = '';
  if (aiGerekliMi()) {
    setLoadingMsg('AI analiz yapılıyor...');
    try {
      aiYorum = await aiPortfoyAnalizYap({
        key:           aktifKey(),
        veriler:       state.veriler,
        takipEdilen:   state.takipEdilen,
        sinyalGecmisi: state.sinyalGecmisi,
        piyasaVerisi:  state.piyasaVerisi,
      });
    } catch (_) {}
  }

  if (aiYorum) aiCalistiKaydet();

  try {
    await sinyalKaydet({
      db, currentUser: state.currentUser,
      veriler:     state.veriler,
      takipEdilen: state.takipEdilen,
      aiYorum,
    });
  } catch (e) {
    showToast('Sinyal kaydedilemedi: ' + (e?.message || 'Firebase hatası'), 'error');
  }

  try {
    await saveUserData({
      db, currentUser: state.currentUser,
      takipEdilen: state.takipEdilen,
      portfoy:     state.portfoy,
      veriler:     state.veriler,
    });
  } catch (_) {}

  hideLoading();
  setStatus('live', 'Canlı');
  renderDashboard();
  renderPortfoy();
  renderHisseler();
  renderSummary();
  setState({ haberlerYuklendi: false });
  const guncellenenSayisi = Object.keys(state.veriler).filter(k => state.veriler[k].fiyat).length;
  showToast(guncellenenSayisi + ' hisse güncellendi ✓');
};

// ─────────────────────────────────────────────
// PİYASA VERİSİ
// ─────────────────────────────────────────────

// ══════════════════════════════════════════════
// PATCH: app.js — _piyasaVerisiCek fonksiyonu
//
// Mevcut _piyasaVerisiCek fonksiyonunu BU KODLA DEĞİŞTİR.
// Yeni semboller: ^XU030, EURUSD=X, GC=F
// ══════════════════════════════════════════════

async function _piyasaVerisiCek() {
  try {
    const data = await fetchPiyasaVerisi();
    if (!data) return;

    const pv = { ...state.piyasaVerisi };

    // ── BIST 100 ──────────────────────────────
    const xu100 = data['^XU100']?.chart?.result?.[0];
    if (xu100) {
      const f = xu100.meta.regularMarketPrice || 0;
      const o = xu100.meta.chartPreviousClose  || 0;
      const d = o > 0 ? +((f - o) / o * 100).toFixed(2) : 0;
      pv.xu100 = { fiyat: f, degisim: d };
      pv.yon   = d;
    }

    // ── BIST 30 ───────────────────────────────
    const xu030 = data['^XU030']?.chart?.result?.[0];
    if (xu030) {
      const f = xu030.meta.regularMarketPrice || 0;
      const o = xu030.meta.chartPreviousClose  || 0;
      pv.xu030 = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    // ── USD/TRY ───────────────────────────────
    const usdtry = data['USDTRY=X']?.chart?.result?.[0];
    if (usdtry) {
      const f = usdtry.meta.regularMarketPrice || 0;
      const o = usdtry.meta.chartPreviousClose  || 0;
      pv.usdtry = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    // ── EUR/TRY ───────────────────────────────
    const eurtry = data['EURTRY=X']?.chart?.result?.[0];
    if (eurtry) {
      const f = eurtry.meta.regularMarketPrice || 0;
      const o = eurtry.meta.chartPreviousClose  || 0;
      pv.eurtry = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    // ── EUR/USD ───────────────────────────────
    const eurusd = data['EURUSD=X']?.chart?.result?.[0];
    if (eurusd) {
      const f = eurusd.meta.regularMarketPrice || 0;
      const o = eurusd.meta.chartPreviousClose  || 0;
      pv.eurusd = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    // ── ALTIN (ONS, USD) ─────────────────────
    // GC=F = COMEX Gold Futures (ons, USD)
    // Gram altın ≈ ons / 31.1035 * USD/TRY
    // Çeyrek ≈ gram * 1.75g (Türkiye standardı 1.75gr)
    // Tam     ≈ gram * 7.00g
    const altinOns = data['GC=F']?.chart?.result?.[0];
    if (altinOns) {
      const onsUsd = altinOns.meta.regularMarketPrice || 0;
      const onsUsdOnce = altinOns.meta.chartPreviousClose || 0;
      const degisim = onsUsdOnce > 0
        ? +((onsUsd - onsUsdOnce) / onsUsdOnce * 100).toFixed(2)
        : 0;

      // Gram TL hesabı (USD/TRY gerekli)
      const kur = pv.usdtry?.fiyat || 0;
      const gramTL  = kur > 0 ? +(onsUsd / 31.1035 * kur).toFixed(2) : 0;
      const ceyrekTL = gramTL > 0 ? +(gramTL * 1.75).toFixed(2) : 0;
      const tamTL    = gramTL > 0 ? +(gramTL * 7.00).toFixed(2)  : 0;

      pv.altin = {
        onsUsd,          // ons fiyatı (USD)
        gramTL,          // gram TL
        ceyrekTL,        // çeyrek altın TL (1.75g)
        tamTL,           // tam altın TL (7g)
        degisim,         // ons bazında % değişim
      };
    }

    setState({ piyasaVerisi: pv });
    renderPiyasaKartlari();
  } catch (e) {
    console.error('_piyasaVerisiCek hatası:', e);
  }
}
// ─────────────────────────────────────────────
// SİNYAL DOĞRULAMA
// ─────────────────────────────────────────────

async function _sinyalleriDogrula() {
  try {
    state.sinyalGecmisi = await sinyalleriDogrula({
      db,
      sinyalGecmisi: state.sinyalGecmisi,
      dogrulamaGun:  state.dogrulamaGun,
      piyasaYon:     state.piyasaVerisi.yon,
    });
  } catch (e) {
    console.error('_sinyalleriDogrula hatası:', e);
  }
}

// ─────────────────────────────────────────────
// HİSSE TAKİP
// ─────────────────────────────────────────────

async function toggleTakip(k) {
  if (state.takipEdilen.has(k)) {
    if (!confirm(k + ' takip listesinden çıkarılsın mı?')) return;
    state.takipEdilen.delete(k);
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

  try {
    await saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
    closeModal('portfoyModal');
    renderHisseler();
    renderPortfoy();
    showToast(k + ' portföye eklendi ✓');
  } catch (e) {
    showToast('Portföy kaydedilemedi: ' + (e?.message || 'Hata'), 'error');
  }
};

async function portfoyCikar(k) {
  if (!confirm(k + ' portföyden çıkarılsın mı?')) return;
  delete state.portfoy[k];
  await saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
  renderPortfoy();
  renderHisseler();
  showToast(k + ' portföyden çıkarıldı');
}

// ─────────────────────────────────────────────
// HİSSE DETAY
// ─────────────────────────────────────────────

async function hisseDetayAc(kod) {
  setState({ detayKod: kod });
  const veri = state.veriler[kod] || {};
  renderHisseDetay(kod, veri);
  renderDetayTeknik(kod, veri);
  openModal('hisseDetayModal');
}

window.detayTakipToggle = () => {
  const k = state.detayKod;
  if (!k) return;
  toggleTakip(k);
  const btn = el('detayTakipBtn');
  if (btn) btn.textContent = state.takipEdilen.has(k) ? '★ Takipte' : '☆ Takibe Al';
};

window.hisseAiAnalizEt = async () => {
  const kod = state.detayKod;
  if (!kod) return;
  const key = aktifKey();
  if (!key) { showToast('AI erişiminiz tanımlı değil. Yöneticinizle iletişime geçin.', 'error'); return; }

  const cache = await hisseAnalizCache({ db, currentUser: state.currentUser, sembol: kod }).catch(() => null);
  if (cache) { renderHisseAnalizSonucu(cache.metin); return; }

  const btn = el('detayAiBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analiz ediliyor...'; }

  try {
    const analiz = await aiHisseAnalizEt({
      key, kod,
      veri:          state.veriler[kod],
      sinyalGecmisi: state.sinyalGecmisi,
      piyasaVerisi:  state.piyasaVerisi,
      portfoy:       state.portfoy,
      haberlerData:  state.haberlerData,
      bistListesi:   BIST,
    });
    if (analiz) {
      await hisseAnalizKaydet({ db, currentUser: state.currentUser, sembol: kod, analiz });
      renderHisseAnalizSonucu(analiz.metin);
    }
  } catch (e) {
    showToast('Analiz yapılamadı: ' + (e?.message || 'Hata'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬡ AI ile Analiz Et'; }
  }
};

// ─────────────────────────────────────────────
// HABERLER
// ─────────────────────────────────────────────

async function _loadHaberler() {
  if (state.haberlerYuklendi) return;
  showLoading('Haberler yükleniyor...');
  try {
    state.haberlerData = await fetchHaberler();
    setState({ haberlerYuklendi: true });
    renderHaberler();
  } catch (e) {
    showToast('Haberler yüklenemedi: ' + (e?.message || 'Bağlantı hatası'), 'error');
  } finally {
    hideLoading();
  }
}

async function tekHaberAnalizEt(idx) {
  if (!state.currentUser) { showToast('Oturum bulunamadı!', 'error'); return; }
  const h   = state.haberlerData[idx];
  if (!h) return;
  const key = aktifKey();
  if (!key) { showToast('AI erişiminiz tanımlı değil. Yöneticinizle iletişime geçin.', 'error'); return; }

  const btn = el('analiz-btn-' + idx);
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
          else if (x.etki === 'olumlu')  showToast('✓ ' + x.kod + ' olumlu etkilenebilir');
        }
      });
      btn?.remove();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '⬡ AI Analiz'; }
    }
  } catch (e) {
    showToast('Haber analizi başarısız: ' + (e?.message || 'Hata'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⬡ AI Analiz'; }
  }
}

// ─────────────────────────────────────────────
// SÖZLÜK
// ─────────────────────────────────────────────

async function _loadSozluk() {
  if (sozlukVeriler.length > 0) { renderPopularTerimler(sozlukVeriler); return; }
  try {
    sozlukVeriler = await loadSozluk({ db });
    renderSozluk(sozlukVeriler);
    renderPopularTerimler(sozlukVeriler);
  } catch (e) {
    showToast('Sözlük yüklenemedi: ' + (e?.message || 'Firebase hatası'), 'error');
  }
}

async function terimSorAPI(terim) {
  if (!state.currentUser) { showToast('Oturum bulunamadı!', 'error'); return; }
  if (!terim) return;
  const key = aktifKey();
  if (!key) { showToast('AI erişiminiz tanımlı değil. Yöneticinizle iletişime geçin.', 'error'); return; }

  const mevcut = sozlukVeriler.find(t => t.terim.toLowerCase() === terim.toLowerCase());
  if (mevcut) {
    await sozlukSorulmaSayisiArtir({ db, mevcutId: mevcut.id, mevcutSorulma: mevcut.sorulma }).catch(() => {});
    mevcut.sorulma++;
    renderSozluk(sozlukVeriler);
    return;
  }

  const btn = el('btnTerimiSor');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const aciklama = await aiTerimAcikla({ key, terim });
    if (aciklama) {
      const yeni = await sozlukTerimKaydet({ db, terim, aciklama, currentUser: state.currentUser });
      sozlukVeriler.unshift(yeni);
      renderSozluk(sozlukVeriler);
      renderPopularTerimler(sozlukVeriler);
      showToast('"' + terim + '" sözlüğe eklendi ✓');
    }
  } catch (e) {
    showToast('Terim açıklaması alınamadı: ' + (e?.message || 'Hata'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sor'; }
  }
}

function toggleTerim(id) {
  const terim = sozlukVeriler.find(t => t.id === id);
  if (!terim) return;
  terim._acik = !terim._acik;
  renderSozluk(sozlukVeriler);
}

async function pushTerimGonderById(id) {
  const terim = sozlukVeriler.find(t => t.id === id);
  if (!terim || !state.isAdmin) return;
  try {
    await pushMesajGonder({
      db, currentUser: state.currentUser,
      baslik: '📚 Bugünün Terimi: ' + terim.terim,
      mesaj:  terim.aciklama,
    });
    await updateDoc(doc(db, 'sozluk', id), { pushGonderildi: true });
    terim.pushGonderildi = true;
    renderSozluk(sozlukVeriler);
    showToast('Push gönderildi ✓');
  } catch (e) {
    showToast('Push gönderilemedi: ' + (e?.message || 'Hata'), 'error');
  }
}

// ─────────────────────────────────────────────
// DOM EVENT BAĞLAMALARI
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Tab navigasyonu
  el('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    _switchTab(btn.dataset.tab, btn);
  });

  // Hisse filtre chip'leri
  document.querySelectorAll('.chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ aktifFilter: btn.dataset.filter });
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderHisseler();
    });
  });

  // Modal kapat
  document.addEventListener('click', (e) => {
    const id = e.target.dataset.modalClose;
    if (id) closeModal(id);
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('show');
    }
  });

  // Auth
  el('btnGoogleLogin')?.addEventListener('click', () => window.googleLogin());
  el('btnLogout')?.addEventListener('click',      () => window.logout());

  // Güncelle
  el('btnGuncelle')?.addEventListener('click', () => window.verileriGuncelle());

  // Hisse arama — yazarken anlik suzme + Enter ile yeni hisse cekme
  el('searchInput')?.addEventListener('input', () => renderHisseler());
  el('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.hisseAra(e.target.value);
  });
  el('btnHisseAra')?.addEventListener('click', () => {
    window.hisseAra(el('searchInput')?.value || '');
  });

  // Sözlük
  el('sozlukAraInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (!q) { showToast('Terim girin', 'error'); return; }
      terimSorAPI(q);
    }
  });
  el('btnTerimiSor')?.addEventListener('click', () => {
    const q = el('sozlukAraInput')?.value.trim();
    if (!q) { showToast('Terim girin', 'error'); return; }
    terimSorAPI(q);
  });

  // Push modal
  el('btnPushGonder')?.addEventListener('click',        () => openModal('pushModal'));
  el('btnPushGonderOnayla')?.addEventListener('click',  () => window.pushGonderOnay());

  // Portföy modal
  el('btnPortfoyKaydet')?.addEventListener('click', () => window.portfoyKaydet());

  // Hisse detay modal
  el('detayAiBtn')?.addEventListener('click',        () => window.hisseAiAnalizEt());
  el('detayTakipBtn')?.addEventListener('click',     () => window.detayTakipToggle());
  el('detayPortfoyEkleBtn')?.addEventListener('click', () => {
    if (state.detayKod) portfoyModalAc(state.detayKod, hisseAdi(state.detayKod));
  });

  // Admin
  el('btnKullaniciEkle')?.addEventListener('click',        () => openModal('addUserModal'));
  el('btnKullaniciEkleOnayla')?.addEventListener('click',  () => window.kullaniciEkle());
  el('btnAdminKeyKaydet')?.addEventListener('click',       () => window.adminKendiKeyiKaydet());
  el('btnMukerrerTemizle')?.addEventListener('click',      () => window.mukerrerTemizle());
  el('btnTokenYenile')?.addEventListener('click',          () => window.loadTokenIstatistik());
  el('btnGunSonuOzet')?.addEventListener('click',          () => window.gunSonuOzetOlustur());
});

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
    el('adminTotalUser') && (el('adminTotalUser').textContent = users.length);

    // Admin kendi API key durumu
    const adminKeyEl = el('adminKendiKeyDurum');
    if (adminKeyEl) {
      adminKeyEl.textContent = aktifKey() ? '✓ Tanımlı' : '⚠ Tanımlı değil';
      adminKeyEl.style.color = aktifKey() ? 'var(--accent)' : 'var(--red)';
    }

    // Kullanıcı listesi — event delegation ile onclick yok
    const kulListEl = el('kullaniciListesi');
    if (kulListEl) {
      kulListEl.innerHTML = '';
      users.forEach(u => {
        const satir = document.createElement('div');
        satir.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--border)';

        const avatar = document.createElement('div');
        avatar.style.cssText = 'width:28px;height:28px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--accent);flex-shrink:0';
        avatar.textContent = (u.name || u.email)[0].toUpperCase();

        const bilgi = document.createElement('div');
        bilgi.style.cssText = 'flex:1;min-width:0';
        bilgi.innerHTML =
          '<div style="font-size:0.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis">' + (u.name || '—') + '</div>' +
          '<div style="font-size:0.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis">' + u.email + '</div>';

        const durum = document.createElement('span');
        durum.className = 'pill ' + (u.active ? 'al' : 'bekle');
        durum.textContent = u.active ? 'Aktif' : 'Pasif';

        const plan = document.createElement('span');
        plan.className = 'pill bekle';
        plan.style.fontSize = '0.6rem';
        plan.textContent = u.plan || 'web';

        const keyDurum = document.createElement('span');
        keyDurum.style.cssText = 'font-size:0.65rem;color:' + (u.apiKeySet ? 'var(--accent)' : 'var(--muted)');
        keyDurum.textContent = u.apiKeySet ? '🔑' : '○';

        satir.append(avatar, bilgi, durum, plan, keyDurum);

        if (!u.isAdmin) {
          if (u.active) {
            const btnKey = document.createElement('button');
            btnKey.className = 'btn';
            btnKey.style.cssText = 'font-size:0.65rem;padding:2px 7px';
            btnKey.textContent = '🔑 Key';
            btnKey.addEventListener('click', () => window.kullaniciKeyTanimla(u.id, u.name || u.email));

            const btnBan = document.createElement('button');
            btnBan.className = 'btn danger';
            btnBan.style.cssText = 'font-size:0.65rem;padding:2px 7px';
            btnBan.textContent = '⊘ Ban';
            btnBan.addEventListener('click', () => window.kullaniciDevreDisi(u.id));

            const btnSil = document.createElement('button');
            btnSil.className = 'btn danger';
            btnSil.style.cssText = 'font-size:0.65rem;padding:2px 6px';
            btnSil.textContent = 'Sil';
            btnSil.addEventListener('click', () => window.kullanicisil(u.id));

            satir.append(btnKey, btnBan, btnSil);
          } else {
            const btnOnayla = document.createElement('button');
            btnOnayla.className = 'btn primary';
            btnOnayla.style.cssText = 'font-size:0.65rem;padding:2px 7px';
            btnOnayla.textContent = '✓ Onayla';
            btnOnayla.addEventListener('click', () => window.kullaniciOnayla(u.id));

            const btnSil = document.createElement('button');
            btnSil.className = 'btn danger';
            btnSil.style.cssText = 'font-size:0.65rem;padding:2px 6px';
            btnSil.textContent = 'Sil';
            btnSil.addEventListener('click', () => window.kullanicisil(u.id));

            satir.append(btnOnayla, btnSil);
          }
        }

        kulListEl.appendChild(satir);
      });
    }
  } catch (e) {
    console.error('Admin yükleme hatası:', e);
    showToast('Admin paneli yüklenemedi: ' + (e?.message || 'Firebase hatası'), 'error');
  }
}

// Admin kendi key'ini kaydeder
window.adminKendiKeyiKaydet = async () => {
  const key = el('adminKendiKey')?.value.trim();
  if (!key) { showToast('API anahtarı boş olamaz!', 'error'); return; }
  if (!key.startsWith('sk-ant-')) { showToast('Geçersiz Anthropic key formatı!', 'error'); return; }

  try {
    await saveUserApiKey({
      targetUid: state.currentUser.uid,
      apiKey:    key,
      isAdmin:   true,
    });
    // State'i güncelle — sayfayı yenilemeden key aktif olsun
    setState({ anthropicKey: key });
    el('adminKendiKey').value = '';
    el('adminKendiKey').type  = 'password';
    const durumEl = el('adminKendiKeyDurum');
    if (durumEl) { durumEl.textContent = '✓ Tanımlı'; durumEl.style.color = 'var(--accent)'; }
    const apiStatusEl = el('apiStatus');
    if (apiStatusEl) { apiStatusEl.textContent = '✓ Tanımlı'; apiStatusEl.style.color = 'var(--accent)'; }
    showToast('Admin API anahtarı kaydedildi ✓');
  } catch (e) {
    showToast('Key kaydedilemedi: ' + (e?.message || 'Hata'), 'error');
  }
};

// Admin bir kullanıcıya key tanımlar (modal)
window.kullaniciKeyTanimla = (uid, ad) => {
  setState({ _keyTanimlaUid: uid });
  const baslik = el('keyTanimlaBaslik');
  if (baslik) baslik.textContent = ad + ' için API Key';
  el('kullaniciKeyInput') && (el('kullaniciKeyInput').value = '');
  openModal('keyTanimlaModal');
};

window.kullaniciKeyKaydet = async () => {
  const uid = state._keyTanimlaUid;
  const key = el('kullaniciKeyInput')?.value.trim();
  if (!uid || !key) { showToast('UID veya key eksik!', 'error'); return; }
  if (!key.startsWith('sk-ant-')) { showToast('Geçersiz Anthropic key formatı!', 'error'); return; }

  const btn = el('btnKullaniciKeyKaydet');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Kaydediliyor...'; }

  try {
    await saveUserApiKey({ targetUid: uid, apiKey: key, isAdmin: true });
    closeModal('keyTanimlaModal');
    showToast('API anahtarı tanımlandı ✓');
    loadAdminPanel(); // listeyi yenile — 🔑 göstergesi güncellensin
  } catch (e) {
    showToast('Key kaydedilemedi: ' + (e?.message || 'Hata'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
  }
};

window.kullaniciOnayla = async (uid) => {
  try {
    await updateDoc(doc(db, 'users', uid), { active: true });
    showToast('Kullanıcı onaylandı ✓');
    loadAdminPanel();
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
};

window.kullaniciDevreDisi = async (uid) => {
  if (!confirm('Kullanıcı devre dışı bırakılsın mı?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), { active: false });
    showToast('Kullanıcı devre dışı bırakıldı');
    loadAdminPanel();
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  }
};

window.showAddUser = () => openModal('addUserModal');

window.kullaniciEkle = async () => {
  const name  = el('newUserName').value.trim();
  const email = el('newUserEmail').value.trim();
  const plan  = el('newUserPlan').value;
  if (!email) { showToast('E-posta zorunlu!', 'error'); return; }
  const uid = btoa(email).replace(/=/g, '');
  try {
    await setDoc(doc(db, 'users', uid), {
      email, name, plan, active: true,
      isAdmin: false, createdAt: serverTimestamp(),
      takipEdilen: [], portfoy: {}, veriler: {},
      apiKeySet: false,
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

window.mukerrerTemizle = async () => {
  if (!confirm('Mükerrer sinyal kayıtları temizlensin mi?')) return;
  showLoading('Mükerrer kayıtlar temizleniyor...');
  try {
    const silinen = await mukerrerSinyalleriTemizle({ db });
    hideLoading();
    showToast(silinen + ' mükerrer kayıt silindi ✓');
    state.sinyalGecmisi = await loadSinyalGecmisi({ db, currentUser: state.currentUser });
    renderSinyalGecmisi();
  } catch (e) { hideLoading(); showToast('Hata: ' + e.message, 'error'); }
};

window.loadTokenIstatistik = async () => {
  const container = el('tokenIstatistik');
  if (!container) return;
  try {
    const ay   = new Date().toISOString().slice(0, 7);
    el('tokenAySec') && (el('tokenAySec').textContent = ay);
    const snap = await getDocs(collection(db, 'tokenKullanim'));
    const buAy = snap.docs.map(d => d.data()).filter(d => d.ay === ay).sort((a, b) => b.toplamToken - a.toplamToken);

    if (buAy.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Bu ay henüz AI kullanımı yok</div>';
      return;
    }
    const toplamToken   = buAy.reduce((s, d) => s + d.toplamToken, 0);
    const toplamMaliyet = buAy.reduce((s, d) => s + d.maliyet, 0);
    const toplamIstek   = buAy.reduce((s, d) => s + d.istekSayisi, 0);

    container.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">' +
        '<div class="card" style="text-align:center"><div class="card-title">Toplam Token</div><div class="card-value mono" style="font-size:1.1rem">' + toplamToken.toLocaleString() + '</div></div>' +
        '<div class="card" style="text-align:center"><div class="card-title">Tahmini Maliyet</div><div class="card-value mono" style="font-size:1.1rem">$' + toplamMaliyet.toFixed(4) + '</div></div>' +
        '<div class="card" style="text-align:center"><div class="card-title">İstek Sayısı</div><div class="card-value mono" style="font-size:1.1rem">' + toplamIstek + '</div></div>' +
      '</div>';
  } catch (e) {
    if (container) container.innerHTML = '<div style="color:var(--red)">Yükleme hatası: ' + e.message + '</div>';
  }
};

async function _loadHaberAnalizleri() {
  const container = el('haberAnalizListesi');
  if (!container || !state.isAdmin) return;
  try {
    const snap      = await getDocs(query(collection(db, 'haberAnalizleri'), orderBy('tarih', 'desc'), limit(50)));
    const analizler = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (analizler.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:1rem">Henüz analiz yok</div>';
      return;
    }
    container.innerHTML = analizler.map(a =>
      '<div style="padding:0.75rem;border-bottom:1px solid var(--border)">' +
        '<div style="font-size:0.82rem;font-weight:500">' + (a.haberBaslik || '—') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--accent)">👤 ' + (a.kullaniciAd || '—') + '</div>' +
        (a.yorum ? '<div style="font-size:0.72rem;color:var(--muted);margin-top:0.25rem">' + a.yorum + '</div>' : '') +
      '</div>'
    ).join('');
  } catch (e) {
    if (container) container.innerHTML = '<div style="color:var(--red)">Yükleme hatası</div>';
  }
}

window.gunSonuOzetOlustur = async () => {
  const key = aktifKey();
  if (!key) { showToast('AI erişiminiz tanımlı değil.', 'error'); return; }
  showLoading('Gün sonu özeti oluşturuluyor...');
  try {
    const snap      = await getDocs(query(collection(db, 'haberAnalizleri'), orderBy('tarih', 'desc'), limit(30)));
    const analizler = snap.docs.map(d => d.data());
    const { text }  = await aiGunSonuOzeti({ key, analizler });
    hideLoading();
    if (text) {
      await pushMesajGonder({ db, currentUser: state.currentUser, baslik: '📊 Gün Sonu BIST Özeti', mesaj: text });
      showToast('Gün sonu özeti push olarak gönderildi ✓');
    } else {
      showToast('Özet oluşturulamadı', 'error');
    }
  } catch (e) {
    hideLoading();
    showToast('Hata: ' + (e?.message || 'Bilinmeyen'), 'error');
  }
};

window.pushGonderOnay = async () => {
  const baslik = el('pushBaslik')?.value.trim();
  const mesaj  = el('pushMesaj')?.value.trim();
  if (!baslik || !mesaj) { showToast('Başlık ve mesaj zorunlu!', 'error'); return; }
  try {
    await pushMesajGonder({ db, currentUser: state.currentUser, baslik, mesaj });
    closeModal('pushModal');
    showToast('Push gönderildi ✓');
  } catch (e) {
    showToast('Push gönderilemedi: ' + (e?.message || 'Hata'), 'error');
  }
};