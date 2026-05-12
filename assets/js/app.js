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
  firebaseHataYonet,
  // ── KAP ──────────────────────────────────
  fetchKapBildirimleri,
  aiKapAnalizEt,
  kapAnalizCache,
  kapAnalizKaydet,
  kapHashOlustur,
  kapSonIndexAl,
  kapSonIndexKaydet,
  aiGrafikAnalizEt,
  analizArsivYukle,
  analizTutarlilikGuncelle,
  loadPushMesajlar,
  loadGunSonuOzetleri,
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
  // ── KAP ──────────────────────────────────
  renderKapListesi,
  renderKapDetay,
  renderKapAnalizSonucu,
  renderKapOzetKartlar,
  renderGrafik,
  renderAnalizGecmisi,
  renderPushMesajlari,
  renderGunSonuOzetleri,
} from './ui.js';

setApiToast(showToast);

// ─────────────────────────────────────────────
// SÖZLÜK LOCAL STATE
// ─────────────────────────────────────────────
let sozlukVeriler = [];

// ─────────────────────────────────────────────
// KAP LOCAL STATE
// ─────────────────────────────────────────────
let _kapBildirimler    = [];
let _kapYuklendi       = false;
let _kapFiltre         = 'tum';
let _kapSadeceTakip    = false;
let _kapSeciliBildirim = null;
let _kapPollingTimer   = null;
let _grafikGun = 30;   // aktif grafik periyodu

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
  kapDetayAc:      (idx)   => _kapDetayAc(idx),
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
    anthropicKey,
    takipEdilen:  new Set(userDoc.takipEdilen || []),
    portfoy:      userDoc.portfoy  || {},
    veriler:      userDoc.veriler  || {},
  });

  // UI
  el('authScreen').style.display = 'none';
  el('appShell').style.display   = 'block';
  renderTopbar();

  if (isAdmin) loadAdminPanel();

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
// ─────────────────────────────────────────────

function _apiKeyDurumGoster() {
  const key = aktifKey();
  const apiStatusEl = el('apiStatus');
  if (apiStatusEl) {
    apiStatusEl.textContent = key ? '✓ Tanımlı' : '⚠ Tanımlı değil';
    apiStatusEl.style.color = key ? 'var(--accent)' : 'var(--red)';
  }
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
  if (name === 'kap')      await _loadKapBildirimleri();
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
      const kod     = h.kod || h.KOD || h.SEMBOL;
      if (!kod) return;
      const fiyat   = parseFloat(h.SON    || h.KAPANIS || h.kapanis || 0);
      const degisim = parseFloat(h.YUZDE  || h.yuzde   || 0);
      const hacim   = parseFloat(h.HACIM  || h.hacim   || 0);
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
    showToast('Sinyal kaydedilemedi: ' + firebaseHataYonet(e), 'error');
  }

  try {
    await saveUserData({
      db, currentUser: state.currentUser,
      takipEdilen: state.takipEdilen,
      portfoy:     state.portfoy,
      veriler:     state.veriler,
    });
  } catch (e) {
    console.warn('verileriGuncelle: saveUserData başarısız', e?.code || e?.message);
  }

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

    const xu030 = data['^XU030']?.chart?.result?.[0];
    if (xu030) {
      const f = xu030.meta.regularMarketPrice || 0;
      const o = xu030.meta.chartPreviousClose  || 0;
      pv.xu030 = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
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

    const eurusd = data['EURUSD=X']?.chart?.result?.[0];
    if (eurusd) {
      const f = eurusd.meta.regularMarketPrice || 0;
      const o = eurusd.meta.chartPreviousClose  || 0;
      pv.eurusd = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    const altinOns = data['GC=F']?.chart?.result?.[0];
    if (altinOns) {
      const onsUsd     = altinOns.meta.regularMarketPrice || 0;
      const onsUsdOnce = altinOns.meta.chartPreviousClose || 0;
      const degisim    = onsUsdOnce > 0
        ? +((onsUsd - onsUsdOnce) / onsUsdOnce * 100).toFixed(2)
        : 0;
      const kur      = pv.usdtry?.fiyat || 0;
      const gramTL   = kur > 0 ? +(onsUsd / 31.1035 * kur).toFixed(2) : 0;
      const ceyrekTL = gramTL > 0 ? +(gramTL * 1.75).toFixed(2) : 0;
      const tamTL    = gramTL > 0 ? +(gramTL * 7.00).toFixed(2)  : 0;
      pv.altin = { onsUsd, gramTL, ceyrekTL, tamTL, degisim };
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
  document.querySelectorAll('.grafik-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.gun) === _grafikGun);
  });
  renderGrafik(kod, _grafikGun);
  const _grafikAiEl = el('grafikAiSonuc');
  if (_grafikAiEl) { _grafikAiEl.style.display = 'none'; _grafikAiEl.innerHTML = ''; }
  const _grafikBtn = el('btnGrafikAnaliz');
  if (_grafikBtn) { _grafikBtn.disabled = false; _grafikBtn.textContent = '📈 Bu Grafiği AI ile Analiz Et'; }
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
    showToast('Sözlük yüklenemedi: ' + firebaseHataYonet(e), 'error');
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

// ═══════════════════════════════════════════════
// KAP BİLDİRİMLERİ
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// Yardımcı: takip listesinde mi?
// ─────────────────────────────────────────────
function _kapTakipteMi(kodlar) {
  return (kodlar || []).some(k => state.takipEdilen.has(k));
}

// ─────────────────────────────────────────────
// Bildirimleri Firestore cache ile eşleştir
// ─────────────────────────────────────────────
async function _kapAnalizEslestir(bildirimler) {
  return Promise.all(bildirimler.map(async (b) => {
    try {
      const hash  = kapHashOlustur(b);
      const cache = await kapAnalizCache({ db, currentUser: state.currentUser, bildirimHash: hash });
      return {
        ...b,
        _hash:      hash,
        _analizVar: !!cache,
        _analiz:    cache || null,
        _onem:      cache?.onem || null,
      };
    } catch (_) {
      return { ...b, _hash: kapHashOlustur(b), _analizVar: false, _analiz: null, _onem: null };
    }
  }));
}

// ─────────────────────────────────────────────
// Render — filtreli listeyi çiz
// ─────────────────────────────────────────────
function _renderKap() {
  const aramaMetni = el('kapSearch')?.value?.trim() || '';
  renderKapListesi(_kapBildirimler, {
    filtre:      _kapFiltre,
    sadeceTakip: _kapSadeceTakip,
    aramaMetni,
  });
}

// ─────────────────────────────────────────────
// KAP Bildirimleri Yükle (ilk yükleme)
// ─────────────────────────────────────────────
async function _loadKapBildirimleri() {
  if (_kapYuklendi) return;

  showLoading('KAP bildirimleri yükleniyor...');
  try {
    const bildirimler = await fetchKapBildirimleri(null);

    if (bildirimler.length === 0) {
      showToast('KAP verisi alınamadı. İnternet bağlantınızı kontrol edin.', 'error');
      hideLoading();
      return;
    }

    // Polling için en yüksek index'i kaydet
    const maxIndex = Math.max(...bildirimler.map(b => b.index || 0));
    kapSonIndexKaydet(maxIndex);

    _kapBildirimler = await _kapAnalizEslestir(bildirimler);
    _kapYuklendi    = true;
    _renderKap();
    _kapPollingBaslat();

  } catch (e) {
    showToast('KAP yüklenemedi: ' + (e?.message || 'Hata'), 'error');
  } finally {
    hideLoading();
  }
}

// ─────────────────────────────────────────────
// KAP Polling — 3 dakikada bir yeni bildirim kontrol
// ─────────────────────────────────────────────
function _kapPollingBaslat() {
  if (_kapPollingTimer) clearInterval(_kapPollingTimer);

  const dotEl = el('kapPollingDot');
  if (dotEl) {
    dotEl.style.background = 'var(--accent)';
    dotEl.title = 'Otomatik yenileme aktif (3 dk)';
  }

  _kapPollingTimer = setInterval(async () => {
    // Sadece KAP paneli görünürken çalış
    if (!el('panel-kap')?.classList.contains('active')) return;

    try {
      const sonIndex = kapSonIndexAl();
      if (!sonIndex) return;

      const yeniler = await fetchKapBildirimleri(sonIndex);
      if (yeniler.length === 0) return;

      const maxIndex = Math.max(...yeniler.map(b => b.index || 0));
      kapSonIndexKaydet(maxIndex);

      const eslestirilmis = await _kapAnalizEslestir(yeniler);
      _kapBildirimler = [...eslestirilmis, ..._kapBildirimler];
      _renderKap();

      // Takip listesindeki hisseler için toast
      const takipBildirimleri = yeniler.filter(b => _kapTakipteMi(b.kodlar));
      if (takipBildirimleri.length > 0) {
        showToast(takipBildirimleri.length + ' yeni KAP bildirimi — takip listenizdeki hisseler');
      }
    } catch (_) {}
  }, 3 * 60 * 1000);
}

// ─────────────────────────────────────────────
// KAP Detay Modal Aç
// ─────────────────────────────────────────────
function _kapDetayAc(idx) {
  const bildirim = _kapBildirimler[idx];
  if (!bildirim) return;

  _kapSeciliBildirim = bildirim;
  renderKapDetay(bildirim);

  const btn = el('kapDetayAiBtn');
  if (bildirim._analiz) {
    renderKapAnalizSonucu(bildirim._analiz);
    if (btn) btn.textContent = '⟳ Yeniden Analiz Et';
  } else {
    if (btn) btn.textContent = '⬡ AI ile Analiz Et';
  }

  openModal('kapDetayModal');
}

// ─────────────────────────────────────────────
// KAP AI Analiz — detay modalından tetiklenir
// ─────────────────────────────────────────────
async function _kapAiAnalizEt() {
  const bildirim = _kapSeciliBildirim;
  if (!bildirim) return;

  const key = aktifKey();
  if (!key) {
    showToast('AI erişiminiz tanımlı değil. Yöneticinizle iletişime geçin.', 'error');
    return;
  }

  const btn = el('kapDetayAiBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analiz ediliyor...'; }

  try {
    const analiz = await aiKapAnalizEt({
      key,
      bildirim,
      takipEdilen: state.takipEdilen,
      portfoy:     state.portfoy,
    });

    if (!analiz) throw new Error('Analiz boş döndü');

    await kapAnalizKaydet({
      db,
      currentUser:  state.currentUser,
      bildirimHash: bildirim._hash,
      bildirim,
      analiz,
    });

    // Local state güncelle
    const idx = _kapBildirimler.findIndex(b => b._hash === bildirim._hash);
    if (idx > -1) {
      _kapBildirimler[idx]._analizVar = true;
      _kapBildirimler[idx]._analiz    = analiz;
      _kapBildirimler[idx]._onem      = analiz.onem;
    }

    renderKapAnalizSonucu(analiz);
    _renderKap();
    showToast('KAP analizi tamamlandı ✓');

  } catch (e) {
    showToast('Analiz yapılamadı: ' + (e?.message || 'Hata'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Yeniden Analiz Et'; }
  }
}

// ─────────────────────────────────────────────
// DOM EVENT BAĞLAMALARI
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Tab navigasyonu — desktop
  el('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    _switchTab(btn.dataset.tab, btn);
  });

  // Tab navigasyonu — mobil menü
  el('mobileNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    el('mobileNav').querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    el('mainNav').querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === btn.dataset.tab);
    });
    _switchTab(btn.dataset.tab, null);
    _closeMobileMenu();
  });

  // Hamburger aç/kapat
  function _openMobileMenu() {
    el('mobileMenu')?.classList.add('open');
    el('mobileMenuOverlay')?.classList.add('show');
    el('btnHamburger')?.classList.add('open');
    el('btnHamburger')?.setAttribute('aria-expanded', 'true');
    const name   = el('userName')?.textContent;
    const avatar = el('userAvatar')?.textContent;
    if (el('mobileUserName'))   el('mobileUserName').textContent   = name   || '...';
    if (el('mobileUserAvatar')) el('mobileUserAvatar').textContent = avatar || '?';
    const dotCls    = el('statusDot')?.className;
    const statusTxt = el('statusText')?.textContent;
    if (el('mobileStatusDot')  && dotCls)    el('mobileStatusDot').className   = dotCls;
    if (el('mobileStatusText') && statusTxt) el('mobileStatusText').textContent = statusTxt;
  }
  function _closeMobileMenu() {
    el('mobileMenu')?.classList.remove('open');
    el('mobileMenuOverlay')?.classList.remove('show');
    el('btnHamburger')?.classList.remove('open');
    el('btnHamburger')?.setAttribute('aria-expanded', 'false');
  }

  el('btnHamburger')?.addEventListener('click', () => {
    const isOpen = el('mobileMenu')?.classList.contains('open');
    isOpen ? _closeMobileMenu() : _openMobileMenu();
  });
  el('btnMobileMenuClose')?.addEventListener('click', _closeMobileMenu);
  el('mobileMenuOverlay')?.addEventListener('click', _closeMobileMenu);

  // Mobil güncelle & çıkış
  el('btnGuncelleMobil')?.addEventListener('click', () => window.verileriGuncelle());
  el('btnLogoutMobil')?.addEventListener('click',   () => window.logout());

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

  // Hisse arama
  el('searchInput')?.addEventListener('input',   () => renderHisseler());
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
  el('btnPushGonder')?.addEventListener('click',       () => openModal('pushModal'));
  el('btnPushGonderOnayla')?.addEventListener('click', () => window.pushGonderOnay());

  // Portföy modal
  el('btnPortfoyKaydet')?.addEventListener('click', () => window.portfoyKaydet());

  // Hisse detay modal
  el('detayAiBtn')?.addEventListener('click',          () => window.hisseAiAnalizEt());
  el('detayTakipBtn')?.addEventListener('click',       () => window.detayTakipToggle());
  el('grafikGunSecici')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gun]');
    if (!btn) return;
    _grafikGun = parseInt(btn.dataset.gun);
    el('grafikGunSecici').querySelectorAll('.grafik-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGrafik(state.detayKod, _grafikGun);
    const aiEl = el('grafikAiSonuc');
    if (aiEl) { aiEl.style.display = 'none'; aiEl.innerHTML = ''; }
    const gBtn = el('btnGrafikAnaliz');
    if (gBtn) { gBtn.disabled = false; gBtn.textContent = '📈 Bu Grafiği AI ile Analiz Et'; }
  });

  el('btnGrafikAnaliz')?.addEventListener('click', () => window.grafikAnalizEt());
  el('detayPortfoyEkleBtn')?.addEventListener('click', () => {
    if (state.detayKod) portfoyModalAc(state.detayKod, hisseAdi(state.detayKod));
  });

  // Admin
  el('btnKullaniciEkle')?.addEventListener('click',         () => openModal('addUserModal'));
  el('btnKullaniciEkleOnayla')?.addEventListener('click',   () => window.kullaniciEkle());
  el('btnAdminKeyKaydet')?.addEventListener('click',        () => window.adminKendiKeyiKaydet());
  el('btnMukerrerTemizle')?.addEventListener('click',       () => window.mukerrerTemizle());
  el('btnTokenYenile')?.addEventListener('click',           () => window.loadTokenIstatistik());
  el('btnGunSonuOzet')?.addEventListener('click',           () => window.gunSonuOzetOlustur());
  el('btnAnalizGecmisi')?.addEventListener('click',         () => window.analizGecmisiAc());
  el('btnBildirimMerkezi')?.addEventListener('click',       () => window.bildirimMerkeziAc());
  el('btnGunSonuOzetleriGoster')?.addEventListener('click', () => window.gunSonuOzetleriGoster());
  el('btnAnalizPdfIndir')?.addEventListener('click',        () => window.analizPdfIndir());

  // ── KAP event'leri ─────────────────────────
  el('btnKapYenile')?.addEventListener('click', async () => {
    _kapYuklendi = false;
    await _loadKapBildirimleri();
  });

  el('btnKapFiltreTakip')?.addEventListener('click', (e) => {
    _kapSadeceTakip = !_kapSadeceTakip;
    e.target.classList.toggle('active', _kapSadeceTakip);
    _renderKap();
  });

  document.querySelectorAll('[data-kap-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-kap-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _kapFiltre = btn.dataset.kapFilter;
      _renderKap();
    });
  });

  el('kapSearch')?.addEventListener('input', () => _renderKap());

  el('kapDetayAiBtn')?.addEventListener('click', () => _kapAiAnalizEt());
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

    const adminKeyEl = el('adminKendiKeyDurum');
    if (adminKeyEl) {
      adminKeyEl.textContent = aktifKey() ? '✓ Tanımlı' : '⚠ Tanımlı değil';
      adminKeyEl.style.color = aktifKey() ? 'var(--accent)' : 'var(--red)';
    }

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
    showToast('Admin paneli yüklenemedi: ' + firebaseHataYonet(e), 'error');
  }
}

window.adminKendiKeyiKaydet = async () => {
  const key = el('adminKendiKey')?.value.trim();
  if (!key) { showToast('API anahtarı boş olamaz!', 'error'); return; }
  if (!key.startsWith('sk-ant-')) { showToast('Geçersiz Anthropic key formatı!', 'error'); return; }
  try {
    await saveUserApiKey({ targetUid: state.currentUser.uid, apiKey: key, isAdmin: true });
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
    loadAdminPanel();
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
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
};

window.kullaniciDevreDisi = async (uid) => {
  if (!confirm('Kullanıcı devre dışı bırakılsın mı?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), { active: false });
    showToast('Kullanıcı devre dışı bırakıldı');
    loadAdminPanel();
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
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
    const ay = new Date().toISOString().slice(0, 7);
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
    const { text }  = await aiGunSonuOzeti({
      key, analizler,
      currentUser: state.currentUser,
      db,               // arşivlemek için
    });
    hideLoading();
    if (text) {
      await pushMesajGonder({ db, currentUser: state.currentUser, baslik: '📊 Gün Sonu BIST Özeti', mesaj: text });
      showToast('Gün sonu özeti gönderildi ve arşivlendi ✓');
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
window.grafikAnalizEt = async () => {
  const kod = state.detayKod;
  if (!kod) return;

  const key = aktifKey();
  if (!key) { showToast('AI erişiminiz tanımlı değil.', 'error'); return; }

  const btn     = el('btnGrafikAnaliz');
  const sonucEl = el('grafikAiSonuc');
  if (!btn || !sonucEl) return;

  btn.disabled    = true;
  btn.textContent = '⏳ Grafik analiz ediliyor...';
  sonucEl.style.display = 'none';

  try {
    const veri = state.veriler[kod];
    if (!veri?.kapanis?.length) {
      showToast('Grafik verisi yok — önce güncelle', 'error');
      return;
    }
    const text = await aiGrafikAnalizEt({ key, kod, veri, gun: _grafikGun });
    if (text) {
      sonucEl.innerHTML = text
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
        .replace(/(\d+[.,]\d+\s*₺)/g, '<strong>$1</strong>');
      sonucEl.style.display = 'block';
      btn.textContent       = '⟳ Yeniden Analiz Et';
    } else {
      btn.textContent = '📈 Bu Grafiği AI ile Analiz Et';
    }
  } catch (e) {
    showToast('Grafik analizi başarısız: ' + (e?.message || 'Hata'), 'error');
    btn.textContent = '📈 Bu Grafiği AI ile Analiz Et';
  } finally {
    btn.disabled = false;
  }
};
window.analizGecmisiAc = async () => {
  const konteyner = el('analizGecmisiListesi');
  if (konteyner) konteyner.innerHTML =
    '<div style="text-align:center;padding:2rem;color:var(--muted)">Yükleniyor...</div>';
 
  openModal('analizGecmisiModal');
 
  try {
    // Önce tutarlılık güncelle (sessizce)
    analizTutarlilikGuncelle({ db, currentUser: state.currentUser, gunOncesi: 5 }).catch(() => {});
 
    const analizler = await analizArsivYukle({
      db, currentUser: state.currentUser, limitSayisi: 100,
    });
    renderAnalizGecmisi(analizler);
  } catch (e) {
    showToast('Analiz geçmişi yüklenemedi: ' + (e?.message || 'Hata'), 'error');
  }
};
window.bildirimMerkeziAc = async () => {
  openModal('bildirimMerkeziModal');
  try {
    const mesajlar = await loadPushMesajlar({ db });
    renderPushMesajlari(mesajlar);
  } catch (e) {
    showToast('Bildirimler yüklenemedi', 'error');
  }
};
window.gunSonuOzetleriGoster = async () => {
  openModal('gunSonuOzetleriModal');
  try {
    const ozetler = await loadGunSonuOzetleri({ db, limitSayisi: 10 });
    renderGunSonuOzetleri(ozetler);
  } catch (e) {
    showToast('Özetler yüklenemedi', 'error');
  }
};