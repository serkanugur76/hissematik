// ══════════════════════════════════════════════
// HisseMatik — Ana Orkestrasyon
// assets/js/app.js
// ══════════════════════════════════════════════

import {
  auth, db, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp, deleteField,
  enableNetwork, disableNetwork,
} from './firebase.js';

import {
  state, setState, resetState,
  ADMIN_EMAILS, BIST, BIST30, BIST100,
  aktifKey, aiGerekliMi, aiCalistiKaydet,
  hisseAdi,
} from './state.js';

import { parseYahooVeri } from './indicators.js';
import { kampanyaKoduDogrula } from './kampanya.js';

import {
  fetchTumHisseFiyatlari,
  fetchTopluYahoo,
  fetchPiyasaVerisi,
  fetchEndeksGecmisi,
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
  kampanyaApiKeyAta,
  fetchAltinFiyatlari,
  aiMakroKorelasyonAnalizEt,
} from './api.js';

import {
  el, setStatus, showLoading, setLoadingMsg, hideLoading,
  showToast, closeModal, openModal,
  renderTopbar, renderPiyasaKartlari, renderPiyasaKartlariSabit, renderSummary,
  renderDashboard, renderHisseler, renderSinyalGecmisi, renderKorelasyonMatrisi,
  renderPortfoy, portfoyModalAc,
  renderHisseDetay, renderDetayOzet, renderDetayTeknik, renderHisseAnalizSonucu,
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

  // Kampanya kodu auth ekranından alındıysa doğrula
  const _authKampanyaKod = (el('authKampanyaKod')?.value || '').trim().toUpperCase();
  let _kampanyaGecerli = false;
  if (_authKampanyaKod) {
    const dogrulamaS = kampanyaKoduDogrula(_authKampanyaKod);
    if (dogrulamaS.gecerli) {
      // Blacklist kontrolü
      try {
        const blackSnap = await getDoc(doc(db, 'kullanilanKodlar', _authKampanyaKod));
        if (!blackSnap.exists()) {
          _kampanyaGecerli = true;
        } else {
          showToast('Bu kampanya kodu daha önce kullanılmış.', 'error');
        }
      } catch (e) {
        // Firebase hatası → yine de devam et, kod geçerli sayılır (fail-open)
        _kampanyaGecerli = true;
      }
    } else {
      showToast('Kampanya kodu geçersiz: ' + (dogrulamaS.sebep || 'Hatalı kod'), 'error');
    }
  }

  // Kayıt yoksa otomatik oluştur
  if (!userSnap.exists() && !isAdmin) {
    const yeniAktif = _kampanyaGecerli;
    try {
      await setDoc(userRef, {
        email:       user.email,
        name:        user.displayName || '',
        plan:        yeniAktif ? 'full' : 'free',
        active:      yeniAktif,
        isAdmin:     false,
        createdAt:   serverTimestamp(),
        takipEdilen: [],
        portfoy:     {},
        veriler:     {},
        apiKeySet:   false,
        ...(yeniAktif && { kaynak: 'instagram', kampanyaKod: _authKampanyaKod }),
      });
    } catch (e) {
      showToast('Kayıt oluşturulamadı: ' + (e?.message || 'Hata'), 'error');
    }

    if (yeniAktif) {
      // Kodu blacklist'e ekle
      try {
        await setDoc(doc(db, 'kullanilanKodlar', _authKampanyaKod), {
          uid: user.uid, email: user.email, usedAt: serverTimestamp(),
        });
      } catch (_) {}
      // Kampanya API key'ini otomatik ata
      await kampanyaApiKeyAta({ uid: user.uid });
      showToast('Kampanya kodu aktive edildi! Hoş geldin 🎉', 'success');
      // Devam et — aşağıdaki flow giriş yapacak
    } else {
      showToast('Erişim talebiniz alındı. Admin onayı bekleniyor.', 'error');
      await signOut(auth);
      el('authScreen').style.display = 'flex';
      return;
    }
  }

  // Kayıt var ama onaysız — kampanya kodu ile aktive et
  if (!isAdmin && !userSnap.data()?.active) {
    if (_kampanyaGecerli) {
      try {
        await updateDoc(userRef, {
          active: true, plan: 'full',
          kaynak: 'instagram', kampanyaKod: _authKampanyaKod,
        });
        await setDoc(doc(db, 'kullanilanKodlar', _authKampanyaKod), {
          uid: user.uid, email: user.email, usedAt: serverTimestamp(),
        });
        await kampanyaApiKeyAta({ uid: user.uid });
        showToast('Kampanya kodu aktive edildi! Hoş geldin 🎉', 'success');
        // Yeniden yükle — userSnap güncel değil, sayfayı yenile
        window.location.reload();
        return;
      } catch (e) {
        showToast('Aktivasyon hatası: ' + e.message, 'error');
      }
    } else {
      showToast('Hesabınız henüz onaylanmadı. Lütfen bekleyin.', 'error');
      await signOut(auth);
      el('authScreen').style.display = 'flex';
      return;
    }
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

  // Kampanya kodu butonunu plan'a göre göster
  // (plan 'full' değilse veya kampanya kodu henüz kullanılmamışsa göster)
  if (!isAdmin) {
    const userPlan = userDoc?.plan || 'free';
    const kampanyaKullanildi = !!userDoc?.kampanyaKod;
    if (userPlan !== 'full' && !kampanyaKullanildi) {
      document.querySelectorAll('.kampanya-kod-btn').forEach(b => b.style.display = 'inline-flex');
    }
  }

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
  if (name === 'haberler')  await _loadHaberler();
  if (name === 'sozluk')    await _loadSozluk();
  // sinyaller sekmesi kaldırıldı — içerik hisseler sekmesinde
  if (name === 'portfoy')   renderPortfoy();
  if (name === 'kap')       await _loadKapBildirimleri();
  if (name === 'hisseler')  { renderDashboard(); renderSummary(); }
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
  renderSinyalGecmisi();
  setState({ haberlerYuklendi: false });
  const guncellenenSayisi = Object.keys(state.veriler).filter(k => state.veriler[k].fiyat).length;
  showToast(guncellenenSayisi + ' hisse güncellendi ✓');
};

// ─────────────────────────────────────────────
// PİYASA VERİSİ
// ─────────────────────────────────────────────

// ─── Yardımcı: Yahoo meta'dan güvenli fiyat ve % değişim çıkarır ────────────
// Yahoo, endeks sembollerinde (^XU100, ^XU030) `chartPreviousClose` alanını
// zaman zaman null/0 olarak döndürür. Bu yüzden:
//   1) regularMarketChangePercent → Yahoo'nun kendi hesabı, en güvenilir
//   2) Yoksa onceki kapanıştan hesapla (birden fazla fallback)
function _metaFiyatParse(result) {
  if (!result) return { fiyat: 0, onceki: 0, degisim: 0 };
  const meta  = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};

  // Güncel fiyat: regularMarketPrice → regularMarketOpen → son kapanış
  const fiyat = meta.regularMarketPrice
    || meta.regularMarketOpen
    || (quote.close || []).filter(Boolean).at(-1)
    || 0;

  // Önceki kapanış (fallback zinciri)
  const onceki = meta.chartPreviousClose
    || meta.regularMarketPreviousClose
    || meta.previousClose
    || (quote.close || []).filter(Boolean).at(-2)
    || 0;

  // % değişim: Yahoo'nun hazır alanını tercih et — endeksler için en doğrusu
  // regularMarketChangePercent zaten doğru hesaplanmış, sadece yuvarla
  const degisim = meta.regularMarketChangePercent != null && meta.regularMarketChangePercent !== 0
    ? +meta.regularMarketChangePercent.toFixed(2)
    : onceki > 0
      ? +((fiyat - onceki) / onceki * 100).toFixed(2)
      : 0;

  return { fiyat, onceki, degisim };
}

function _degisimHesapla(fiyat, onceki) {
  return onceki > 0 ? +((fiyat - onceki) / onceki * 100).toFixed(2) : 0;
}

async function _piyasaVerisiCek() {
  try {
    const [data, xu100Kapanis, xu030Kapanis, altinKapanis, brentKapanis, wtiKapanis,
           sp500Kapanis, nasdaqKapanis, daxKapanis, ftseKapanis, nikkeiKapanis,
           usdtryKapanis, eurtryKapanis, eurusdKapanis] = await Promise.all([
      fetchPiyasaVerisi(),
      fetchEndeksGecmisi('XU100.IS'),
      fetchEndeksGecmisi('XU030.IS'),
      fetchEndeksGecmisi('GC=F'),
      fetchEndeksGecmisi('BZ=F'),
      fetchEndeksGecmisi('CL=F'),
      fetchEndeksGecmisi('^GSPC'),
      fetchEndeksGecmisi('^IXIC'),
      fetchEndeksGecmisi('^GDAXI'),
      fetchEndeksGecmisi('^FTSE'),
      fetchEndeksGecmisi('^N225'),
      fetchEndeksGecmisi('USDTRY=X'),
      fetchEndeksGecmisi('EURTRY=X'),
      fetchEndeksGecmisi('EURUSD=X'),
    ]);
    if (!data) return;

    const pv = { ...state.piyasaVerisi };

    const xu100Result = data['XU100.IS']?.chart?.result?.[0];
    if (xu100Result) {
      const { fiyat, degisim } = _metaFiyatParse(xu100Result);
      pv.xu100 = { fiyat, degisim, kapanis: xu100Kapanis };
      pv.yon   = degisim;
    }

    const xu030Result = data['XU030.IS']?.chart?.result?.[0];
    if (xu030Result) {
      const { fiyat, degisim } = _metaFiyatParse(xu030Result);
      pv.xu030 = { fiyat, degisim, kapanis: xu030Kapanis };
    }

    const usdtryResult = data['USDTRY=X']?.chart?.result?.[0];
    if (usdtryResult) {
      const { fiyat, degisim } = _metaFiyatParse(usdtryResult);
      pv.usdtry = { fiyat, degisim, kapanis: usdtryKapanis };
    }

    const eurtryResult = data['EURTRY=X']?.chart?.result?.[0];
    if (eurtryResult) {
      const { fiyat, degisim } = _metaFiyatParse(eurtryResult);
      pv.eurtry = { fiyat, degisim, kapanis: eurtryKapanis };
    }

    const eurusdResult = data['EURUSD=X']?.chart?.result?.[0];
    if (eurusdResult) {
      const { fiyat, degisim } = _metaFiyatParse(eurusdResult);
      pv.eurusd = { fiyat, degisim, kapanis: eurusdKapanis };
    }

    // Altın fiyatlarını anlık Türk kaynağından çek
    const altinData = await fetchAltinFiyatlari();
    if (altinData && altinData.gramTL) {
      const kur        = pv.usdtry?.fiyat || 0;
      const gramKapanis = kur > 0
        ? altinKapanis.map(function(v) { return +(v / 31.1035 * kur).toFixed(2); })
        : altinKapanis;
      pv.altin = {
        onsUsd:         altinData.onsUsd,
        gramTL:         altinData.gramTL,
        ceyrekTL:       altinData.ceyrekTL,
        yarimTL:        altinData.yarimTL,
        tamTL:          altinData.tamTL,
        degisim:        altinData.degisim,
        kapanis:        gramKapanis,
        onsKapanis:     altinKapanis,
        ceyrekKapanis:  gramKapanis.map(function(v) { return +(v * 1.606).toFixed(2); }),
        yarimKapanis:   gramKapanis.map(function(v) { return +(v * 3.212).toFixed(2); }),
        tamKapanis:     gramKapanis.map(function(v) { return +(v * 6.431).toFixed(2); }),
      };
    } else {
      // Fallback: spot fiyattan hesapla
      const altinResult = data['GC=F']?.chart?.result?.[0];
      if (altinResult) {
        const { fiyat: onsUsd, degisim } = _metaFiyatParse(altinResult);
        const kur    = pv.usdtry?.fiyat || 0;
        const gramTL = kur > 0 ? +(onsUsd / 31.1035 * kur).toFixed(2) : 0;
        const gramKapanis = kur > 0
          ? altinKapanis.map(function(v) { return +(v / 31.1035 * kur).toFixed(2); })
          : altinKapanis;
        pv.altin = {
          onsUsd, gramTL, degisim,
          kapanis:       gramKapanis,
          onsKapanis:    altinKapanis,
          ceyrekTL:      gramTL > 0 ? +(gramTL * 1.606).toFixed(2) : 0,
          yarimTL:       gramTL > 0 ? +(gramTL * 3.212).toFixed(2) : 0,
          tamTL:         gramTL > 0 ? +(gramTL * 6.431).toFixed(2) : 0,
          ceyrekKapanis: gramKapanis.map(function(v) { return +(v * 1.606).toFixed(2); }),
          yarimKapanis:  gramKapanis.map(function(v) { return +(v * 3.212).toFixed(2); }),
          tamKapanis:    gramKapanis.map(function(v) { return +(v * 6.431).toFixed(2); }),
        };
      }
    }

    // Global endeksler
    function _endeksParse(kapanis) {
      if (!kapanis || kapanis.length < 2) return null;
      const fiyat   = kapanis.at(-1) || 0;
      const onceki  = kapanis.at(-2) || fiyat;
      const degisim = onceki > 0 ? +((fiyat - onceki) / onceki * 100).toFixed(2) : 0;
      return { fiyat: +fiyat.toFixed(2), degisim, kapanis };
    }
    if (sp500Kapanis.length)  pv.sp500  = _endeksParse(sp500Kapanis);
    if (nasdaqKapanis.length) pv.nasdaq = _endeksParse(nasdaqKapanis);
    if (daxKapanis.length)    pv.dax    = _endeksParse(daxKapanis);
    if (ftseKapanis.length)   pv.ftse   = _endeksParse(ftseKapanis);
    if (nikkeiKapanis.length) pv.nikkei = _endeksParse(nikkeiKapanis);

    // Petrol: Brent (BZ=F) ve WTI (CL=F)
    function _petrolParse(kapanis) {
      if (!kapanis || kapanis.length < 2) return null;
      const fiyat    = kapanis.at(-1) || 0;
      const onceki   = kapanis.at(-2) || fiyat;
      const degisim  = onceki > 0 ? +((fiyat - onceki) / onceki * 100).toFixed(2) : 0;
      return { fiyat: +fiyat.toFixed(2), degisim, kapanis };
    }
    const brentData = _petrolParse(brentKapanis);
    const wtiData   = _petrolParse(wtiKapanis);
    if (brentData) pv.brent = brentData;
    if (wtiData)   pv.wti   = wtiData;

    setState({ piyasaVerisi: pv });
    renderPiyasaKartlari();
    renderPiyasaKartlariSabit();
    renderKorelasyonMatrisi();

    // Makro analiz butonu: piyasa verisi hazırsa göster
    const makroBtnSatir = el('makroAnalizSatiri');
    if (makroBtnSatir && aktifKey()) makroBtnSatir.style.display = 'block';
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
  const _grafikAiEl = el('grafikAiSonuc');
  if (_grafikAiEl) { _grafikAiEl.style.display = 'none'; _grafikAiEl.innerHTML = ''; }
  const _grafikBtn = el('btnGrafikAnaliz');
  if (_grafikBtn) { _grafikBtn.disabled = false; _grafikBtn.textContent = '📈 Bu Grafiği AI ile Analiz Et'; }

  // Modal önce açılmalı — aksi hâlde canvas display:none içinde kalır,
  // offsetWidth=0 döner ve grafik doğru çizilemez.
  openModal('hisseDetayModal');

  // Kapanis verisi yoksa (takip dışı hisse veya ilk açılış) Yahoo'dan çek
  requestAnimationFrame(async () => {
    // RAF tetiklendiğinde kullanıcı zaten başka hisseye geçtiyse hiç çalışma
    if (state.detayKod !== kod) return;
    if (!state.veriler[kod]?.kapanis?.length) {
      const wrap = el('grafikWrap');
      if (wrap) {
        let loadingEl = wrap.querySelector('.grafik-loading');
        if (!loadingEl) {
          loadingEl = document.createElement('div');
          loadingEl.className = 'grafik-loading';
          loadingEl.style.cssText = 'text-align:center;padding:2rem;color:var(--muted);font-size:0.82rem';
          wrap.appendChild(loadingEl);
        }
        loadingEl.textContent = '⏳ Grafik verisi yükleniyor...';
      }
      try {
        const yeniVeri = await fetchYahoo(kod, state.piyasaVerisi.yon);
        if (yeniVeri) {
          const mevcut = state.veriler[kod] || {};
          state.veriler[kod] = { ...mevcut, ...yeniVeri };
          // Ana kartı etkileyen alanları koru — detay fetch'i ana listeyi değiştirmesin
          if (mevcut.fiyat)                    state.veriler[kod].fiyat      = mevcut.fiyat;
          if (mevcut.degisim !== undefined)     state.veriler[kod].degisim    = mevcut.degisim;
          if (mevcut.sinyal)                    state.veriler[kod].sinyal     = mevcut.sinyal;
          if (mevcut.guvenSkoru !== undefined)  state.veriler[kod].guvenSkoru = mevcut.guvenSkoru;
        }
      } catch (_) {}
    }
    // Fetch sürerken başka hisseye geçildiyse render etme
    if (state.detayKod !== kod) return;
    renderDetayOzet(kod);
    renderDetayTeknik(kod);
    renderGrafik(kod, _grafikGun);
  });
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
function _kapDetayAc(disclosureIndex) {
  const bildirim = _kapBildirimler.find(b => b.index === disclosureIndex);
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

  // Alt sekme navigasyonu (Hisseler paneli içi)
  document.querySelector('.sub-tab-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-subtab]');
    if (!btn) return;
    const subtab = btn.dataset.subtab;
    document.querySelectorAll('.sub-tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === 'subpanel-' + subtab));
    if (subtab === 'sinyaller') renderSinyalGecmisi();
    if (subtab === 'tum')       renderHisseler();
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

  // Mobil menü — topbar buton yansımaları
  el('btnBildirimMerkeziMobil')?.addEventListener('click', () => {
    _closeMobileMenu();
    window.bildirimMerkeziAc();
  });
  el('btnAnalizGecmisiMobil')?.addEventListener('click', () => {
    _closeMobileMenu();
    window.analizGecmisiAc();
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

  // ── Floating Tooltip ──
  // 500ms gecikme: hızlı tıklarda tooltip hiç açılmaz
  // Tıklamada anında kapanır → buton üstünde donup kalmaz
  (function() {
    const tip = document.getElementById('floatingTooltip');
    if (!tip) return;
    let _active  = null;
    let _timer   = null;

    function _goster(target) {
      tip.textContent = target.dataset.tooltip;
      tip.classList.add('ft-visible');
    }
    function _gizle() {
      clearTimeout(_timer);
      _timer = null;
      tip.classList.remove('ft-visible');
      _active = null;
    }

    document.addEventListener('mouseover', e => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) { _gizle(); return; }
      if (target === _active) return;
      clearTimeout(_timer);
      _active = target;
      // 500ms bekle — hızlı tıkta tooltip çıkmaz
      _timer = setTimeout(() => _goster(target), 500);
    });

    document.addEventListener('mousemove', e => {
      if (!_active) return;
      const x    = e.clientX + 14;
      const y    = e.clientY - 44;
      const maxX = window.innerWidth  - tip.offsetWidth  - 8;
      const maxY = window.innerHeight - tip.offsetHeight - 8;
      tip.style.left = Math.min(x, maxX) + 'px';
      tip.style.top  = Math.min(Math.max(y, 6), maxY) + 'px';
    });

    document.addEventListener('mouseout', e => {
      if (!_active) return;
      const to = e.relatedTarget;
      if (to && _active.contains(to)) return;
      _gizle();
    });

    // Tıklamada ANINDA kapat — buton üstünde donup kalmasın
    document.addEventListener('mousedown', _gizle);
  })();

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

  // Sinyal geçmişi — doğrulama süresini state'e yansıt + manuel kontrol butonu
  el('dogrulamaSuresi')?.addEventListener('change', (e) => {
    setState({ dogrulamaGun: parseInt(e.target.value) || 3 });
  });
  el('btnSinyalleriGuncelle')?.addEventListener('click', async () => {
    const btn = el('btnSinyalleriGuncelle');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Kontrol ediliyor...'; }
    try {
      const once    = (state.sinyalGecmisi || []).filter(s => s.dogrulandi !== null).length;
      await _sinyalleriDogrula();
      renderSinyalGecmisi();
      renderSummary();
      const sonra   = (state.sinyalGecmisi || []).filter(s => s.dogrulandi !== null).length;
      const yeni    = sonra - once;
      const bekleyen = (state.sinyalGecmisi || []).filter(s => s.dogrulandi === null).length;
      if (state.sinyalGecmisi.length === 0) {
        showToast('Henüz kayıtlı sinyal yok — önce "Güncelle"ye bas.', 'info');
      } else if (yeni > 0) {
        showToast(yeni + ' sinyal sonuçlandı ✓', 'success');
      } else if (bekleyen > 0) {
        showToast(bekleyen + ' sinyal ' + state.dogrulamaGun + ' günlük bekleme süresinde.', 'info');
      } else {
        showToast('Tüm sinyaller zaten değerlendirilmiş.', 'info');
      }
    } catch (e) {
      showToast('Doğrulama sırasında hata: ' + (e?.message || ''), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sonuçları Kontrol Et'; }
    }
  });
  el('btnTokenYenile')?.addEventListener('click',           () => window.loadTokenIstatistik());
  el('btnGunSonuOzet')?.addEventListener('click',           () => window.gunSonuOzetOlustur());
  el('btnAnalizGecmisi')?.addEventListener('click',         () => window.analizGecmisiAc());
  el('btnAnalizGecmisiMobil')?.addEventListener('click',    () => { closeModal('mobileMenu'); window.analizGecmisiAc(); });
  el('btnBildirimMerkezi')?.addEventListener('click',       () => window.bildirimMerkeziAc());

  // Kampanya kodu (topbar + mobil)
  el('btnKampanya')?.addEventListener('click',      () => window.kampanyaModalAc());
  el('btnKampanyaMobil')?.addEventListener('click', () => { closeModal('mobileMenu'); window.kampanyaModalAc(); });
  el('btnGunSonuOzetleriGoster')?.addEventListener('click', () => window.gunSonuOzetleriGoster());
  el('btnAnalizPdfIndir')?.addEventListener('click',        () => window.analizPdfIndir());

  el('detayPaylasBtn')?.addEventListener('click', async () => {
    const btn     = el('detayPaylasBtn');
    const modal   = document.querySelector('#hisseDetayModal .modal');
    const body    = modal?.querySelector('.modal-body');
    if (!modal || !body || typeof html2canvas === 'undefined') return;

    btn.disabled    = true;
    btn.textContent = '⏳ Hazırlanıyor...';

    const origBodyMaxH = body.style.maxHeight;
    const origBodyOver = body.style.overflow;
    const origBodyH    = body.style.height;
    const origModalMaxH = modal.style.maxHeight;
    const origModalOver = modal.style.overflow;
    const origModalH    = modal.style.height;

    body.style.maxHeight  = 'none';
    body.style.overflow   = 'visible';
    body.style.height     = 'auto';
    modal.style.maxHeight = 'none';
    modal.style.overflow  = 'visible';
    modal.style.height    = 'auto';

    // Boyutun DOM'a yansıması için kısa bekleme
    await new Promise(r => setTimeout(r, 120));

    try {
      const canvas = await html2canvas(modal, {
        backgroundColor: '#0d1117',
        scale:           2,
        useCORS:         true,
        allowTaint:      true,
        logging:         false,
        height:          modal.scrollHeight,
        windowHeight:    modal.scrollHeight,
      });
      const link    = document.createElement('a');
      link.download = (state.detayKod || 'hisse') + '-analiz.png';
      link.href     = canvas.toDataURL('image/png');
      link.click();
    } catch (_) {
      showToast('PNG oluşturulamadı.', 'error');
    } finally {
      body.style.maxHeight  = origBodyMaxH;
      body.style.overflow   = origBodyOver;
      body.style.height     = origBodyH;
      modal.style.maxHeight = origModalMaxH;
      modal.style.overflow  = origModalOver;
      modal.style.height    = origModalH;
      btn.disabled          = false;
      btn.textContent       = '📸 Paylaş';
    }
  });

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

    // Kampanya key durumu
    try {
      const kampanyaKonfig = await getDoc(doc(db, 'config', 'kampanya'));
      const kampanyaKeyEl = el('kampanyaKeyDurum');
      if (kampanyaKeyEl) {
        const var_ = kampanyaKonfig.exists() && kampanyaKonfig.data()?.apiKey;
        kampanyaKeyEl.textContent = var_ ? '✓ Tanımlı' : '⚠ Tanımlı değil';
        kampanyaKeyEl.style.color = var_ ? 'var(--accent)' : 'var(--red)';
      }
    } catch (_) {}

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

        const kaynakBadge = document.createElement('span');
        if (u.kaynak === 'instagram') {
          kaynakBadge.style.cssText = 'font-size:0.6rem;background:rgba(225,48,108,0.15);color:#e1306c;border:1px solid rgba(225,48,108,0.3);border-radius:4px;padding:1px 5px';
          kaynakBadge.textContent = '📸 IG';
        }

        satir.append(avatar, bilgi, durum, plan, keyDurum);
        if (u.kaynak === 'instagram') satir.appendChild(kaynakBadge);

        if (!u.isAdmin) {
          if (u.active) {
            const btnKey = document.createElement('button');
            btnKey.className = 'btn';
            btnKey.style.cssText = 'font-size:0.65rem;padding:2px 7px';
            btnKey.textContent = '🔑 Key';
            btnKey.addEventListener('click', () => window.kullaniciKeyTanimla(u.id, u.name || u.email));

            if (u.apiKeySet) {
              const btnKeySil = document.createElement('button');
              btnKeySil.className = 'btn danger';
              btnKeySil.style.cssText = 'font-size:0.65rem;padding:2px 6px';
              btnKeySil.textContent = '🗑 Key';
              btnKeySil.addEventListener('click', () => window.kullaniciKeySil(u.id));
              satir.appendChild(btnKeySil);
            }

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

window.kampanyaKeySave = async () => {
  const key = el('kampanyaApiKeyInput')?.value.trim();
  if (!key) { showToast('API anahtarı boş olamaz!', 'error'); return; }
  if (!key.startsWith('sk-ant-')) { showToast('Geçersiz Anthropic key formatı!', 'error'); return; }
  try {
    await setDoc(doc(db, 'config', 'kampanya'), { apiKey: key, guncellendi: serverTimestamp() });
    el('kampanyaApiKeyInput').value = '';
    el('kampanyaApiKeyInput').type  = 'password';
    const durumEl = el('kampanyaKeyDurum');
    if (durumEl) { durumEl.textContent = '✓ Tanımlı'; durumEl.style.color = 'var(--accent)'; }
    showToast('Kampanya API key kaydedildi ✓');
  } catch (e) {
    showToast('Kaydedilemedi: ' + (e?.message || 'Hata'), 'error');
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

window.kullaniciKeySil = async (uid) => {
  if (!confirm('Bu kullanıcının API key\'i silinsin mi?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), {
      encryptedApiKey: deleteField(), apiKeySet: false, apiKeyTarih: deleteField(),
    });
    showToast('API key silindi');
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

// ══════════════════════════════════════════════
// KAMPANYA KODU — Giriş yapmış kullanıcı için
// ══════════════════════════════════════════════

window.korelasyonModalAc = () => { openModal('korelasyonModal'); };

window.portfoyAnalizModalAc = () => {
  const son = state.sinyalGecmisi?.[0];
  if (!son?.aiYorum) {
    showToast('Henüz AI analizi mevcut değil.', 'info');
    return;
  }

  // Zaman damgası
  const zEl = el('portfoyAnalizZaman');
  if (zEl) {
    let zamanStr = '';
    if (son.tarih?.toDate) {
      zamanStr = son.tarih.toDate().toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    } else if (son.tarih) {
      zamanStr = new Date(son.tarih).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    }
    zEl.textContent = zamanStr ? 'Son güncelleme: ' + zamanStr : '';
  }

  // İçerik
  const icerikEl = el('portfoyAnalizIcerik');
  if (icerikEl) {
    // Markdown-benzeri basit biçimlendirme: **kalın**, satır başı boşlukları
    const html = son.aiYorum
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    icerikEl.innerHTML = html;
  }

  openModal('portfoyAnalizModal');
};

// ── Makro Analiz Cache ──────────────────────────
const MAKRO_CACHE_KEY = 'hm_makro_analiz_v1';
const MAKRO_CACHE_SURE = 6 * 60 * 60 * 1000; // 6 saat
const MAKRO_DEGISIM_ESIK = 2.5; // %2.5'ten fazla fiyat farkı → yenile öner

function _makroCacheOku() {
  try { return JSON.parse(localStorage.getItem(MAKRO_CACHE_KEY) || 'null'); } catch { return null; }
}
function _makroCacheYaz(yorum, fiyatlar) {
  try { localStorage.setItem(MAKRO_CACHE_KEY, JSON.stringify({ yorum, fiyatlar, tarih: Date.now() })); } catch {}
}
function _makroFiyatlarCikart(pv) {
  return {
    bist: pv.xu100?.fiyat || 0,
    sp500: pv.sp500?.fiyat || 0,
    altin: pv.altin?.onsUsd || 0,
    brent: pv.brent?.fiyat || 0,
    usd: pv.usdtry?.fiyat || 0,
  };
}
function _makroCacheGecerlimi(cache) {
  if (!cache?.yorum || !cache?.tarih) return false;
  return (Date.now() - cache.tarih) < MAKRO_CACHE_SURE;
}
function _onemliDegisimVarMi(eskiFiyatlar, yeniFiyatlar) {
  return Object.keys(yeniFiyatlar).some(k => {
    const e = eskiFiyatlar[k], y = yeniFiyatlar[k];
    if (!e || !y) return false;
    return Math.abs((y - e) / e * 100) >= MAKRO_DEGISIM_ESIK;
  });
}

function _makroIcerikGoster(yorum, tarih, icerikEl, zamanEl, yenilemeBtnEkle) {
  if (!icerikEl) return;
  const html = yorum
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  icerikEl.innerHTML = html;
  if (zamanEl) {
    const tarihStr = new Date(tarih).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    zamanEl.innerHTML = 'Analiz tarihi: ' + tarihStr +
      (yenilemeBtnEkle
        ? ' &nbsp;<button onclick="window.makroAnalizYenile()" class="btn btn-xs" style="font-size:0.65rem;padding:0.15rem 0.5rem">⟳ Yenile</button>'
        : '');
  }
}

window.makroAnalizYenile = () => {
  localStorage.removeItem(MAKRO_CACHE_KEY);
  window.makroAnalizYap(true);
};

window.makroAnalizYap = async (zorlaYenile = false) => {
  const key = aktifKey();
  if (!key) { showToast('AI analizi için API key gerekli.', 'error'); return; }

  const pv = state.piyasaVerisi;

  // Snapshot tablosu
  const snapshotEl = el('makroAnalizSnapshot');
  if (snapshotEl) {
    function _snap(ad, fiyat, degisim, birim) {
      const d   = parseFloat(degisim) || 0;
      const cls = d >= 0 ? 'pos' : 'neg';
      const isk = d >= 0 ? '+' : '';
      return '<div class="makro-snap-item">' +
        '<span class="makro-snap-ad">' + ad + '</span>' +
        '<span class="makro-snap-fiyat">' + (fiyat || '—') + (birim ? ' ' + birim : '') + '</span>' +
        '<span class="makro-snap-deg ' + cls + '">' + (degisim !== undefined ? isk + d.toFixed(2) + '%' : '') + '</span>' +
      '</div>';
    }
    snapshotEl.innerHTML =
      '<div class="makro-snap-grup">📈 Borsa</div>' +
      _snap('BIST 100',    pv.xu100?.fiyat?.toLocaleString('tr-TR'), pv.xu100?.degisim) +
      _snap('S&P 500',     pv.sp500?.fiyat?.toLocaleString('tr-TR'), pv.sp500?.degisim) +
      _snap('NASDAQ',      pv.nasdaq?.fiyat?.toLocaleString('tr-TR'),pv.nasdaq?.degisim) +
      _snap('DAX',         pv.dax?.fiyat?.toLocaleString('tr-TR'),   pv.dax?.degisim) +
      _snap('FTSE 100',    pv.ftse?.fiyat?.toLocaleString('tr-TR'),  pv.ftse?.degisim) +
      _snap('Nikkei',      pv.nikkei?.fiyat?.toLocaleString('tr-TR'),pv.nikkei?.degisim) +
      '<div class="makro-snap-grup">💱 Döviz</div>' +
      _snap('USD/TRY',     pv.usdtry?.fiyat?.toFixed(2), pv.usdtry?.degisim, '₺') +
      _snap('EUR/TRY',     pv.eurtry?.fiyat?.toFixed(2), pv.eurtry?.degisim, '₺') +
      _snap('EUR/USD',     pv.eurusd?.fiyat?.toFixed(4), pv.eurusd?.degisim) +
      '<div class="makro-snap-grup">🏅 Emtia</div>' +
      _snap('Altın Gram',  pv.altin?.gramTL?.toFixed(0), pv.altin?.degisim, '₺') +
      _snap('Altın ONS',   pv.altin?.onsUsd?.toFixed(2), pv.altin?.degisim, '$') +
      _snap('Brent',       pv.brent?.fiyat?.toFixed(2),  pv.brent?.degisim, '$') +
      _snap('WTI',         pv.wti?.fiyat?.toFixed(2),    pv.wti?.degisim,   '$');
  }

  const icerikEl = el('makroAnalizIcerik');
  const zamanEl  = el('makroAnalizZaman');
  openModal('makroAnalizModal');

  // ── Cache kontrolü ──
  if (!zorlaYenile) {
    const cache = _makroCacheOku();
    if (cache?.yorum) {
      const guncelFiyatlar = _makroFiyatlarCikart(pv);
      const degisimVar = cache.fiyatlar ? _onemliDegisimVarMi(cache.fiyatlar, guncelFiyatlar) : false;
      if (!degisimVar) {
        // Cache geçerli, göster
        _makroIcerikGoster(cache.yorum, cache.tarih, icerikEl, zamanEl, true);
        return;
      }
      // Önemli değişim var — cache'i göster ama uyar
      _makroIcerikGoster(cache.yorum, cache.tarih, icerikEl, zamanEl, false);
      if (zamanEl) zamanEl.innerHTML += ' &nbsp;<span style="color:var(--yellow);font-size:0.65rem">⚠ Piyasada önemli değişim var</span>' +
        ' &nbsp;<button onclick="window.makroAnalizYenile()" class="btn btn-xs" style="font-size:0.65rem;padding:0.15rem 0.5rem">⟳ Yenile</button>';
      return;
    }
  }

  // ── Yeni analiz iste ──
  if (icerikEl) icerikEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">&#9685; AI analiz hazırlanıyor...</div>';
  if (zamanEl)  zamanEl.textContent = '';

  const btn = el('btnMakroAnaliz');
  if (btn) { btn.disabled = true; btn.textContent = 'Analiz yapılıyor...'; }

  try {
    const yorum = await aiMakroKorelasyonAnalizEt({ key, piyasaVerisi: pv });
    if (yorum) {
      _makroCacheYaz(yorum, _makroFiyatlarCikart(pv));
      _makroIcerikGoster(yorum, Date.now(), icerikEl, zamanEl, true);
    } else {
      if (icerikEl) icerikEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Analiz alınamadı. Tekrar dene.</div>';
    }
  } catch (e) {
    const mesaj = e?.message === 'API_TIMEOUT'
      ? 'Yanıt süresi aşıldı. Tekrar dene.'
      : e?.message === 'API_KEY_INVALID'
      ? 'Geçersiz API key.'
      : 'Hata: ' + (e?.message || 'Bağlantı sorunu');
    if (icerikEl) icerikEl.innerHTML = '<div style="color:var(--red);padding:1rem">' + mesaj + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬡ Makro Korelasyon Analizi'; }
  }
};

window.kampanyaModalAc = () => {
  const input = el('kampanyaKodInput');
  const hata  = el('kampanyaHata');
  const btn   = el('btnKampanyaAktif');
  if (input) input.value = '';
  if (hata)  { hata.textContent = ''; hata.style.display = 'none'; }
  if (btn)   { btn.disabled = false; btn.textContent = 'Aktive Et'; }
  openModal('kampanyaModal');
};

window.kampanyaKoduAktif = async () => {
  const input = el('kampanyaKodInput');
  const hata  = el('kampanyaHata');
  const btn   = el('btnKampanyaAktif');
  const kod   = (input?.value || '').trim().toUpperCase();

  function _hataGoster(mesaj) {
    if (hata) { hata.textContent = mesaj; hata.style.display = 'block'; }
    showToast(mesaj, 'error');
  }

  if (!kod) { _hataGoster('Kod boş olamaz.'); return; }

  // Algoritma doğrulama
  const sonuc = kampanyaKoduDogrula(kod);
  if (!sonuc.gecerli) {
    _hataGoster(sonuc.sebep || 'Geçersiz kod.');
    return;
  }

  // Kullanıcı giriş yapmış mı?
  const user = state.currentUser;
  if (!user) { _hataGoster('Önce giriş yapmalısın.'); return; }

  btn.disabled    = true;
  btn.textContent = 'Kontrol ediliyor...';

  try {
    // Blacklist kontrolü
    const blackSnap = await getDoc(doc(db, 'kullanilanKodlar', kod));
    if (blackSnap.exists()) {
      _hataGoster('Bu kod daha önce kullanılmış.');
      btn.disabled = false; btn.textContent = 'Aktive Et';
      return;
    }

    // Kodu kullanılmış olarak işaretle
    await setDoc(doc(db, 'kullanilanKodlar', kod), {
      uid: user.uid, email: user.email, usedAt: serverTimestamp(),
    });

    // Kullanıcı dokümanını güncelle
    await updateDoc(doc(db, 'users', user.uid), {
      plan: 'full', active: true,
      kaynak: 'instagram', kampanyaKod: kod,
    });

    // Kampanya API key'ini otomatik ata
    await kampanyaApiKeyAta({ uid: user.uid });

    // Butonu göster/gizle
    document.querySelectorAll('.kampanya-kod-btn').forEach(b => b.style.display = 'none');

    closeModal('kampanyaModal');
    showToast('🎉 Kampanya kodu aktive edildi! Premium erişim açık.', 'success');
  } catch (e) {
    _hataGoster('Bir hata oluştu: ' + (e.message || 'Bilinmeyen hata'));
    btn.disabled = false; btn.textContent = 'Aktive Et';
  }
};