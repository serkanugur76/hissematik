// ══════════════════════════════════════════════
// HisseMatik — Ana Orkestrasyon
// assets/js/app.js
// ══════════════════════════════════════════════

// ── İmport'lar ────────────────────────────────
import {
  auth, db, provider,
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp,
  // #5 — Offline banner için
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
  // #6 — api.js toast callback bağlantısı
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

// ─────────────────────────────────────────────
// #6 — api.js'e showToast'u bağla
// Bu sayede api.js içindeki _notify() çağrıları
// kullanıcıya görünür toast gösterir.
// ─────────────────────────────────────────────
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
// #5 — OFFLINE / ONLINE BANNER
// ─────────────────────────────────────────────

function _offlineBannerGoster() {
  let banner = el('offlineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id        = 'offlineBanner';
    banner.innerHTML =
      '⚠️ İnternet bağlantısı yok — veriler güncellenemiyor. Bağlantı gelince otomatik devam eder.';
    Object.assign(banner.style, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      right:           '0',
      zIndex:          '9999',
      background:      'var(--red, #ff4560)',
      color:           '#fff',
      padding:         '0.6rem 1rem',
      fontSize:        '0.82rem',
      textAlign:       'center',
      fontWeight:      '500',
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
window.addEventListener('online',  () => {
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

  let userSnap;
  try {
    const userRef = doc(db, 'users', user.uid);
    userSnap      = await getDoc(userRef);
  } catch (e) {
    showToast('Firebase bağlantı hatası: ' + (e?.message || 'Bilinmeyen hata'), 'error');
    el('loadingScreen').classList.add('hide');
    el('authScreen').style.display = 'flex';
    return;
  }

  const userRef  = doc(db, 'users', user.uid);
  const isAdmin  = ADMIN_EMAILS.includes(user.email);

  if (!isAdmin && !userSnap.exists()) {
    showToast('Bu e-posta ile erişim izniniz yok.', 'error');
    await signOut(auth);
    el('authScreen').style.display = 'flex';
    return;
  }

  const userDoc = userSnap.exists() ? userSnap.data() : {};

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

  setState({
    currentUser:   user,
    userDoc,
    isAdmin,
    anthropicKey:  userDoc.apiKey || '',
    takipEdilen:   new Set(userDoc.takipEdilen || []),
    portfoy:       userDoc.portfoy  || {},
    veriler:       userDoc.veriler  || {},
  });

  const havuzKey = await loadHavuzKey({ db });
  setState({ havuzKey, anthropicKey: havuzKey || state.anthropicKey });

  el('authScreen').style.display = 'none';
  el('appShell').style.display   = 'block';
  renderTopbar();

  if (isAdmin) loadAdminPanel();

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
    const bistRes = await fetch('https://hissematik-proxy.ugurserkan.workers.dev/?bistliste=1');
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
// TAB YÖNETİMİ
// ─────────────────────────────────────────────

async function _switchTab(name, btn) {
  switchTab(name, btn);

  if (name === 'haberler') await _loadHaberler();
  if (name === 'sozluk')   await _loadSozluk();
  if (name === 'sinyaller')   renderSinyalGecmisi();
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

  setLoadingMsg('Piyasa genel verisi çekiliyor...');
  await _piyasaVerisiCek();

  setLoadingMsg('Hisse verileri çekiliyor...');
  try {
    const hisseler = await fetchTumHisseFiyatlari();
    hisseler.forEach(h => {
      const kod     = h.KOD || h.kod || h.SEMBOL;
      if (!kod) return;
      const fiyat   = parseFloat(h.KAPANIS || h.SON   || h.kapanis || 0);
      const degisim = parseFloat(h.YUZDE  || h.yuzde || 0);
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
  } catch (e) {}

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

    const xu100 = data['XU100.IS']?.chart?.result?.[0];
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

    const xu030 = data['XU030.IS']?.chart?.result?.[0];
    if (xu030) {
      const f = xu030.meta.regularMarketPrice || 0;
      const o = xu030.meta.chartPreviousClose  || 0;
      pv.xu030 = { fiyat: f, degisim: o > 0 ? +((f - o) / o * 100).toFixed(2) : 0 };
    }

    setState({ piyasaVerisi: pv });
    renderPiyasaKartlari();
  } catch (e) {
    console.error('Piyasa verisi hatası:', e);
  }
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

// ─────────────────────────────────────────────
// HİSSE TAKİP
// ─────────────────────────────────────────────

function toggleTakip(k) {
  if (state.takipEdilen.has(k)) {
    if (!confirm(k + ' takipten çıkarılsın mı?')) return;
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
  try {
    await saveUserData({ db, currentUser: state.currentUser, takipEdilen: state.takipEdilen, portfoy: state.portfoy, veriler: state.veriler });
    renderPortfoy();
    showToast(k + ' portföyden çıkarıldı');
  } catch (e) {
    showToast('Portföy güncellenemedi: ' + (e?.message || 'Hata'), 'error');
  }
}

window.closeModal = closeModal;

// ─────────────────────────────────────────────
// HİSSE DETAY PANELİ
// ─────────────────────────────────────────────

async function hisseDetayAc(kod) {
  setState({ detayKod: kod });
  renderHisseDetay(kod);

  if (state.currentUser) {
    hisseAnalizCache({ db, currentUser: state.currentUser, kod }).then(cached => {
      if (cached) {
        renderHisseAnalizSonucu(cached);
        el('detayAiBtn').textContent = '⬡ Yeniden Analiz Et';
      }
    }).catch(() => {});
  }

  if (!state.veriler[kod]?.bollinger) {
    el('detayAiIcerik').innerHTML = '<span style="color:var(--muted);font-size:0.78rem">⏳ Teknik veriler yükleniyor...</span>';
    try {
      const v = await fetchYahoo(kod, state.piyasaVerisi.yon);
      if (v) {
        state.veriler[kod] = { ...state.veriler[kod], ...v };
        renderDetayTeknik(kod);
      }
    } catch (e) {
      showToast(kod + ' teknik verisi alınamadı.', 'error');
    }
    el('detayAiIcerik').innerHTML = '<span style="color:var(--muted)">Analiz için butona bas...</span>';
  }
}

window.hisseAiAnalizEt = async () => {
  if (!state.currentUser) { showToast('Oturum bulunamadı!', 'error'); return; }
  const kod = state.detayKod;
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }

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
      // ── DEĞİŞİKLİK: metin → gerekce dönüşümü ──
      const analizKayit = { ...analiz, gerekce: analiz.metin, karar: 'BEKLE', tarih: analiz.tarih };
      await hisseAnalizKaydet({ db, currentUser: state.currentUser, kod, analiz: analizKayit });
      renderHisseAnalizSonucu(analizKayit);
      if (btn) btn.textContent = '⬡ Yeniden Analiz Et';
    }
  } catch (e) {
    showToast(kod + ' analizi başarısız: ' + (e?.message || 'Hata'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⬡ AI Analiz Et'; }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.detayTakipToggle = () => {
  const kod = state.detayKod;
  if (!kod) return;
  toggleTakip(kod);
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

  const haberler = await fetchHaberler();

  if (haberler.length === 0) {
    el('haberListesi').innerHTML =
      '<div style="text-align:center;padding:3rem;color:var(--muted)">' +
      '<div style="color:var(--red);margin-bottom:0.5rem">Haberler yüklenemedi</div>' +
      '<button class="btn primary" onclick="haberleriYenile()" style="margin-top:1rem">Tekrar Dene</button>' +
      '</div>';
    return;
  }

  haberler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
  setState({ haberlerData: haberler, haberlerYuklendi: true });
  renderHaberler();
  showToast(haberler.length + ' haber yüklendi ✓');

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
}

async function tekHaberAnalizEt(idx) {
  if (!state.currentUser) { showToast('Oturum bulunamadı!', 'error'); return; }
  const h   = state.haberlerData[idx];
  if (!h) return;
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }

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
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }

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

  el('mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    _switchTab(btn.dataset.tab, btn);
  });

  document.querySelectorAll('.chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ aktifFilter: btn.dataset.filter });
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderHisseler();
    });
  });

  document.addEventListener('click', (e) => {
    const id = e.target.dataset.modalClose;
    if (id) closeModal(id);
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('show');
    }
  });

  el('btnGoogleLogin')?.addEventListener('click', () => window.googleLogin());
  el('btnLogout')?.addEventListener('click', () => window.logout());
  el('btnGuncelle')?.addEventListener('click', () => window.verileriGuncelle());

  el('btnSpkKapat')?.addEventListener('click', () => {
    el('spkUyari').style.display = 'none';
  });

  el('searchInput')?.addEventListener('input', () => renderHisseler());
  el('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.hisseAra(e.target.value);
  });
  el('btnTakibiKaldir')?.addEventListener('click', () => window.takibiKaldir());

  el('dogrulamaSuresi')?.addEventListener('change', (e) => {
    setState({ dogrulamaGun: parseInt(e.target.value) });
    renderSinyalGecmisi();
    showToast('Doğrulama süresi ' + state.dogrulamaGun + ' gün olarak ayarlandı');
  });
  el('btnSinyalleriGuncelle')?.addEventListener('click', () => window.sinyalleriGuncelle());

  el('btnHaberleriYenile')?.addEventListener('click', () => _haberleriYenile());

  el('sozlukSearch')?.addEventListener('input', (e) => {
    renderSozluk(sozlukVeriler, e.target.value);
  });
  el('btnTerimiSor')?.addEventListener('click', () => {
    const q = el('sozlukSearch').value.trim();
    if (!q) { showToast('Önce terim yaz!', 'error'); return; }
    terimSorAPI(q);
  });
  el('btnPushGonder')?.addEventListener('click', () => openModal('pushModal'));
  el('btnPushGonderOnayla')?.addEventListener('click', () => window.pushGonderOnay());
  el('btnPortfoyKaydet')?.addEventListener('click', () => window.portfoyKaydet());

  el('detayAiBtn')?.addEventListener('click', () => window.hisseAiAnalizEt());
  el('detayTakipBtn')?.addEventListener('click', () => window.detayTakipToggle());
  el('detayPortfoyEkleBtn')?.addEventListener('click', () => {
    if (state.detayKod) portfoyModalAc(state.detayKod, hisseAdi(state.detayKod));
  });

  el('btnKullaniciEkle')?.addEventListener('click', () => openModal('addUserModal'));
  el('btnKullaniciEkleOnayla')?.addEventListener('click', () => window.kullaniciEkle());
  el('btnSaveApiKey')?.addEventListener('click', () => window.saveApiKey());
  el('btnMukerrerTemizle')?.addEventListener('click', () => window.mukerrerTemizle());
  el('btnTokenYenile')?.addEventListener('click', () => window.loadTokenIstatistik());
  el('btnGunSonuOzet')?.addEventListener('click', () => window.gunSonuOzetOlustur());
  el('detayPaylasBtn')?.addEventListener('click', async () => {
    const hedef = document.querySelector('#hisseDetayModal .modal-body');
    if (!hedef) return;
    const btn = el('detayPaylasBtn');
    btn.textContent = '⏳ Hazırlanıyor...';
    btn.disabled = true;
    try {
      const canvas = await html2canvas(hedef, {
        backgroundColor: '#0f1117',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      const kod = el('detayHisseAdi')?.textContent || 'hisse';
      link.download = 'HisseMatik_' + kod + '_' + new Date().toLocaleDateString('tr-TR').replace(/\./g, '-') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      showToast('Görüntü alınamadı: ' + e.message, 'error');
    } finally {
      btn.textContent = '📸 Paylaş';
      btn.disabled = false;
    }
  });
  el('detayPaylasBtn')?.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;

    // Arka plan
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, W, H, 'F');

    // Üst gradient şerit
    doc.setFillColor(0, 229, 160);
    doc.rect(0, 0, W, 2, 'F');

    // Logo
    doc.setTextColor(0, 229, 160);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Hisse', 15, 18);
    doc.setTextColor(255, 255, 255);
    doc.text('MATiK', 38, 18);

    // Slogan
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 180);
    doc.setFont('helvetica', 'normal');
    doc.text('Aylik 500 ile tum riskinizi minimize edin', 15, 26);

    // Hisse başlık kutusu
    const kod = el('detayHisseAdi')?.textContent || '—';
    const sirket = el('detayHisseSirket')?.textContent || '—';
    const v = state.veriler?.[kod] || {};

    doc.setFillColor(25, 30, 40);
    doc.roundedRect(10, 32, W - 20, 28, 3, 3, 'F');
    doc.setFillColor(0, 229, 160);
    doc.roundedRect(10, 32, 4, 28, 2, 2, 'F');

    doc.setTextColor(0, 229, 160);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(kod, 20, 43);

    doc.setTextColor(200, 200, 200);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(sirket, 20, 51);

    const fiyat = v.fiyat ? v.fiyat + ' TL' : '—';
    const degisim = v.degisim != null ? (v.degisim >= 0 ? '+' : '') + v.degisim + '%' : '—';
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(fiyat, W - 15, 43, { align: 'right' });
    doc.setFontSize(10);
    doc.setTextColor(v.degisim >= 0 ? 0 : 255, v.degisim >= 0 ? 229 : 69, v.degisim >= 0 ? 160 : 96);
    doc.text(degisim, W - 15, 51, { align: 'right' });

    // Teknik Göstergeler başlık
    doc.setTextColor(0, 229, 160);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Teknik Gostergeler', 15, 72);
    doc.setDrawColor(0, 229, 160);
    doc.setLineWidth(0.3);
    doc.line(15, 74, W - 15, 74);

    // Göstergeler grid
    const gostergeler = [
      ['RSI (14)', v.rsi ?? '—', v.rsi < 30 ? 'Asiri Satiim' : v.rsi > 70 ? 'Asiri Alim' : 'Notr'],
      ['MACD Hist', v.macdHist?.toFixed(3) ?? '—', v.macdHist > 0 ? 'Pozitif' : 'Negatif'],
      ['MA 20', v.ma20 ? v.ma20.toFixed(2) + ' TL' : '—', ''],
      ['MA 50', v.ma50 ? v.ma50.toFixed(2) + ' TL' : '—', ''],
      ['Bollinger %', v.bollinger?.yuzde + '%' ?? '—', v.bollinger?.yuzde < 25 ? 'Alt Bant' : v.bollinger?.yuzde > 75 ? 'Ust Bant' : 'Orta'],
      ['Hacim Fark', v.hacimFark ? (v.hacimFark > 0 ? '+' : '') + v.hacimFark + '%' : '—', v.hacimFark > 50 ? 'Spike' : 'Normal'],
    ];

    let gy = 80;
    const gw = (W - 30) / 3;
    gostergeler.forEach((([lbl, val, sub], i) => {
      const gx = 15 + (i % 3) * gw;
      if (i % 3 === 0 && i > 0) gy += 22;

      doc.setFillColor(25, 30, 40);
      doc.roundedRect(gx, gy, gw - 3, 20, 2, 2, 'F');

      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(lbl, gx + 3, gy + 6);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(String(val), gx + 3, gy + 13);

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(sub, gx + 3, gy + 18);
    }));

    // Sinyal
    gy += 28;
    const sinyal = v.sinyal || 'BEKLE';
    const sinyalRenk = sinyal.includes('AL') ? [0, 229, 160] : sinyal.includes('SAT') ? [255, 69, 96] : [255, 200, 50];
    doc.setFillColor(...sinyalRenk);
    doc.roundedRect(15, gy, 50, 10, 2, 2, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(sinyal, 40, gy + 7, { align: 'center' });

    // AI Analiz
    gy += 18;
    doc.setTextColor(0, 229, 160);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Karar Analizi', 15, gy);
    doc.line(15, gy + 2, W - 15, gy + 2);

    gy += 8;
    doc.setFillColor(20, 25, 35);
    doc.roundedRect(10, gy, W - 20, 80, 3, 3, 'F');

    const aiMetin = el('detayAiIcerik')?.innerText || 'Analiz bulunamadi.';
    const temizMetin = aiMetin
  .replace(/[*#]/g, '')
  .replace(/[^\x00-\x7F]/g, (c) => {
    const map = { 'ş':'s','Ş':'S','ğ':'g','Ğ':'G','ü':'u','Ü':'U','ı':'i','İ':'I','ö':'o','Ö':'O','ç':'c','Ç':'C','â':'a','î':'i','û':'u' };
    return map[c] || '';
  })
  .trim();
    doc.setTextColor(180, 210, 200);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const satirlar = doc.splitTextToSize(temizMetin, W - 30);
    doc.text(satirlar.slice(0, 18), 15, gy + 8);

    // Alt pazarlama bölümü
    gy = H - 55;
    doc.setFillColor(0, 229, 160, 0.1);
    doc.setFillColor(20, 40, 35);
    doc.roundedRect(10, gy, W - 20, 38, 3, 3, 'F');
    doc.setDrawColor(0, 229, 160);
    doc.setLineWidth(0.5);
    doc.roundedRect(10, gy, W - 20, 38, 3, 3, 'S');

    doc.setTextColor(0, 229, 160);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Aylik 500 TL ile Riskinizi Minimize Edin!', W / 2, gy + 10, { align: 'center' });

    doc.setTextColor(200, 200, 200);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const pazarlamaMetin = 'HisseMatik ile yapay zeka destekli teknik analiz, gercek zamanli sinyaller ve portfoy takibini tek platformda yapin. RSI, MACD, Bollinger ve daha fazlasi ile piyasanin bir adim onunde olun.';
    const pSatirlar = doc.splitTextToSize(pazarlamaMetin, W - 40);
    doc.text(pSatirlar, W / 2, gy + 18, { align: 'center' });

    doc.setTextColor(0, 229, 160);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Instagram: @algoritmatematik', W / 2, gy + 32, { align: 'center' });

    // Alt çizgi
    doc.setFillColor(0, 229, 160);
    doc.rect(0, H - 2, W, 2, 'F');

    // Tarih
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('HisseMatik • ' + new Date().toLocaleDateString('tr-TR') + ' • Bu rapor yatirim tavsiyesi degildir.', W / 2, H - 5, { align: 'center' });

    doc.save('HisseMatik_' + kod + '_' + new Date().toLocaleDateString('tr-TR').replace(/\./g, '-') + '.pdf');
  });
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

    const config = await getDoc(doc(db, 'config', 'global'));
    const apiKeyEl = el('adminApiKey');
    if (config.exists() && apiKeyEl) apiKeyEl.value = config.data().anthropicKey || '';

    const kulListEl = el('kullaniciListesi');
    if (kulListEl) kulListEl.innerHTML = users.map(u =>
      '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--border)">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--accent);flex-shrink:0">' + (u.name || u.email)[0].toUpperCase() + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.8rem;font-weight:500;overflow:hidden;text-overflow:ellipsis">' + (u.name || '—') + '</div>' +
          '<div style="font-size:0.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis">' + u.email + '</div>' +
        '</div>' +
        '<span class="pill ' + (u.active ? 'al' : 'bekle') + '">' + (u.active ? 'Aktif' : 'Pasif') + '</span>' +
        '<span class="pill bekle" style="font-size:0.6rem">' + (u.plan || 'web') + '</span>' +
        (!u.isAdmin ? '<button class="btn danger" onclick="kullanicisil(\'' + u.id + '\')" style="font-size:0.7rem;padding:2px 6px">Sil</button>' : '') +
      '</div>'
    ).join('');
  } catch (e) {
    console.error('Admin yükleme hatası:', e);
    showToast('Admin paneli yüklenemedi: ' + (e?.message || 'Firebase hatası'), 'error');
  }
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
  try {
    await apiSaveApiKey({ db, currentUser: state.currentUser, key });
    showToast('API anahtarı kaydedildi ✓');
    el('apiStatus').textContent = key ? '✓ Tanımlı' : 'Tanımlı değil';
    el('apiStatus').style.color = key ? 'var(--accent)' : 'var(--muted)';
  } catch (e) {}
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
    el('tokenAySec').textContent = ay;
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
    if (analizler.length === 0) { container.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:1rem">Henüz analiz yok</div>'; return; }
    container.innerHTML = analizler.map(a =>
      '<div style="padding:0.75rem;border-bottom:1px solid var(--border)">' +
        '<div style="font-size:0.82rem;font-weight:500">' + (a.haberBaslik || '—') + '</div>' +
        '<div style="font-size:0.72rem;color:var(--accent)">👤 ' + (a.kullaniciAd || '—') + '</div>' +
        (a.yorum ? '<div style="font-size:0.75rem;color:var(--muted);margin-top:0.4rem">' + a.yorum + '</div>' : '') +
      '</div>'
    ).join('');
  } catch (e) {
    if (container) container.innerHTML = '<div style="color:var(--red);font-size:0.8rem">' + e.message + '</div>';
  }
}

window.gunSonuOzetOlustur = async () => {
  const key = aktifKey();
  if (!key) { showToast('API anahtarı gerekli!', 'error'); return; }
  showLoading('Gün sonu özeti hazırlanıyor...');
  try {
    const snap      = await getDocs(query(collection(db, 'haberAnalizleri'), orderBy('tarih', 'desc'), limit(100)));
    const bugun     = new Date().toLocaleDateString('tr-TR');
    const analizler = snap.docs.map(d => d.data()).filter(a => new Date(a.tarih).toLocaleDateString('tr-TR') === bugun);
    if (analizler.length === 0) { hideLoading(); showToast('Bugün henüz analiz yapılmamış!', 'error'); return; }
    const { text } = await aiGunSonuOzeti({ key, analizler });
    hideLoading();
    if (text) {
      el('pushBaslik').value = '📊 ' + bugun + ' Piyasa Özeti';
      el('pushMesaj').value  = text;
      openModal('pushModal');
    }
  } catch (e) { hideLoading(); showToast('Hata: ' + e.message, 'error'); }
};

window.pushGonderOnay = async () => {
  const baslik = el('pushBaslik').value.trim();
  const mesaj  = el('pushMesaj').value.trim();
  if (!baslik || !mesaj) { showToast('Başlık ve mesaj zorunlu!', 'error'); return; }
  try {
    await pushMesajGonder({ db, currentUser: state.currentUser, baslik, mesaj });
    closeModal('pushModal');
    showToast('Push mesajı gönderildi! ✓');
    showPushBildirim(baslik, mesaj);
  } catch (e) { showToast('Hata: ' + e.message, 'error'); }
};

// ─────────────────────────────────────────────
// LOADING SCREEN
// ─────────────────────────────────────────────
setTimeout(() => el('loadingScreen').classList.add('hide'), 2000);