// ══════════════════════════════════════════════
// HisseMatik — API & Network Katmanı
// assets/js/api.js
// ══════════════════════════════════════════════

import {
  db,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  query, where, orderBy, limit, serverTimestamp,
} from './firebase.js';

import { parseYahooVeri, genelSinyal, avg } from './indicators.js';

// ─────────────────────────────────────────────
// SABİTLER
// ─────────────────────────────────────────────

const PROXY      = 'https://hissematik-proxy.ugurserkan.workers.dev';
const KAP_PROXY  = 'https://hissematik.vercel.app/api/kap';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_VER = '2023-06-01';
const MODEL      = 'claude-sonnet-4-6';

const TOKEN_MALIYET = 0.000003;

// Kullanıcı başına max analiz arşiv kaydı
const ARSIV_LIMIT = 30;

// ─────────────────────────────────────────────
// TOAST CALLBACK
// ─────────────────────────────────────────────

let _toast = null;
export function setApiToast(fn) { _toast = fn; }
function _notify(mesaj, tip = 'error') {
  if (_toast) _toast(mesaj, tip);
  else        console.error('[api]', mesaj);
}

// ─────────────────────────────────────────────
// ŞİFRELEME — Web Crypto API (AES-GCM)
// ─────────────────────────────────────────────

async function _uiddenAnahtar(uid) {
  const enc    = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(uid), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('hissematik-salt-v1'), iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function apiKeyEncrypt(apiKey, uid) {
  const key    = await _uiddenAnahtar(uid);
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const enc    = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKey));
  const buf    = new Uint8Array(iv.byteLength + cipher.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...buf));
}

export async function apiKeyDecrypt(encrypted, uid) {
  try {
    const key   = await _uiddenAnahtar(uid);
    const buf   = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv    = buf.slice(0, 12);
    const data  = buf.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch { return ''; }
}

// ─────────────────────────────────────────────
// FİRESTORE — KULLANICI API KEY KAYDET
// ─────────────────────────────────────────────

export async function saveUserApiKey({ targetUid, apiKey, isAdmin }) {
  if (!isAdmin) { _notify('Bu işlem için admin yetkisi gerekli.', 'error'); return; }
  if (!targetUid || !apiKey) { _notify('Kullanıcı UID veya API key eksik.', 'error'); return; }
  try {
    const encrypted = await apiKeyEncrypt(apiKey, targetUid);
    await updateDoc(doc(db, 'users', targetUid), {
      encryptedApiKey: encrypted, apiKeySet: true, apiKeyTarih: Date.now(),
    });
  } catch (e) {
    console.error('saveUserApiKey hatası:', e);
    _notify('API anahtarı kaydedilemedi: ' + (e?.message || 'Firebase hatası'));
    throw e;
  }
}

export async function loadUserApiKey({ uid, encryptedKey }) {
  if (!uid || !encryptedKey) return '';
  return apiKeyDecrypt(encryptedKey, uid);
}

// ─────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function temizleKey(key) { return (key || '').replace(/[^a-zA-Z0-9\-_]/g, '').trim(); }

async function claudeIste(key, mesajlar, maxToken = 1000, zaman = 25000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), zaman);
  let res;
  try {
    res = await fetch(CLAUDE_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         temizleKey(key),
        'anthropic-version': CLAUDE_VER,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxToken, messages: mesajlar }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('API_TIMEOUT');
    throw e;
  }
  clearTimeout(timeoutId);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('API_KEY_INVALID');
    if (res.status === 429) throw new Error('API_QUOTA_EXCEEDED');
    throw new Error(err?.error?.message || 'Claude API hatası: ' + res.status);
  }
  const data   = await res.json();
  const text   = data?.content?.[0]?.text || '';
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  return { text, tokens };
}

// ─────────────────────────────────────────────
// YAHOO FINANCE
// ─────────────────────────────────────────────

export async function fetchYahoo(sembol, piyasaYon = 0) {
  try {
    const url  = PROXY + '?sembol=' + encodeURIComponent(sembol + '.IS');
    const res  = await fetch(url);
    const json = await res.json();
    const raw  = json?.chart?.result?.[0];
    if (!raw) return null;
    return parseYahooVeri(raw, piyasaYon);
  } catch (e) { console.error('fetchYahoo hatası:', sembol, e); return null; }
}

export async function fetchTopluYahoo(semboller, piyasaYon = 0) {
  const sonuclar = {};
  const BATCH    = 5;
  for (let i = 0; i < semboller.length; i += BATCH) {
    const dilim = semboller.slice(i, i + BATCH);
    await Promise.all(dilim.map(async (s) => {
      const v = await fetchYahoo(s, piyasaYon);
      if (v) sonuclar[s] = v;
    }));
    if (i + BATCH < semboller.length) await sleep(300);
  }
  return sonuclar;
}

export async function fetchTumHisseFiyatlari() {
  try {
    const res  = await fetch(PROXY + '?tumfiyatlar=1');
    const json = await res.json();
    return Array.isArray(json?.hisseler) ? json.hisseler : [];
  } catch (e) { console.error('fetchTumHisseFiyatlari hatası:', e); return []; }
}

export async function fetchPiyasaVerisi() {
  try {
    const res = await fetch(PROXY + '?piyasa=1');
    return await res.json();
  } catch (e) { console.error('fetchPiyasaVerisi hatası:', e); return null; }
}

// Son 30 günlük günlük kapanış verisi — sembolü OLDUĞU GİBİ alır (.IS eklemez)
export async function fetchEndeksGecmisi(sembol) {
  try {
    const url = PROXY + '?sembol=' + encodeURIComponent(sembol);
    const res = await fetch(url);
    const json = await res.json();
    const raw = json?.chart?.result?.[0];
    if (!raw) return [];
    const close = (raw.indicators?.quote?.[0]?.close || []).filter(function(v) { return v != null && v > 0; });
    return close.slice(-30);
  } catch (e) { console.error('fetchEndeksGecmisi hatası:', sembol, e); return []; }
}

export async function fetchHaberler() {
  try {
    const res  = await fetch(PROXY + '?haberler=1');
    const json = await res.json();
    return Array.isArray(json?.haberler) ? json.haberler : [];
  } catch (e) { console.error('fetchHaberler hatası:', e); return []; }
}

// ─────────────────────────────────────────────
// CLAUDE AI — GRAFİK ANALİZİ
// ─────────────────────────────────────────────

export async function aiGrafikAnalizEt({ key, kod, veri, gun }) {
  if (!key || !veri?.kapanis?.length) return '';
  const kapanis = veri.kapanis.slice(-Math.min(gun, veri.kapanis.length));
  if (kapanis.length < 3) return '';

  const ilk    = kapanis[0];
  const son    = kapanis.at(-1);
  const degPct = +((son - ilk) / ilk * 100).toFixed(2);
  const min    = +Math.min(...kapanis).toFixed(2);
  const max    = +Math.max(...kapanis).toFixed(2);
  const ma7    = +(kapanis.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, kapanis.length)).toFixed(2);
  const ma20   = kapanis.length >= 20
    ? +(kapanis.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : null;
  const son5   = kapanis.slice(-5);
  const yonler = son5.map((v, i) => i === 0 ? '→' : v > son5[i-1] ? '↑' : v < son5[i-1] ? '↓' : '→').join(' ');
  const son10  = kapanis.slice(-10);
  const max10  = +Math.max(...son10).toFixed(2);
  const min10  = +Math.min(...son10).toFixed(2);

  const prompt =
    'Sen BIST teknik analiz uzmanısın. Aşağıdaki grafik verisine göre kısa yorum yap.\n\n' +
    'HİSSE: ' + kod + '\nDÖNEM: Son ' + gun + ' gün\n' +
    'İlk kapanış: ' + ilk + '₺  →  Son kapanış: ' + son + '₺\n' +
    'Dönem değişimi: ' + (degPct >= 0 ? '+' : '') + degPct + '%\n' +
    'Dönem düşük: ' + min + '₺  |  Dönem yüksek: ' + max + '₺\n' +
    'Son 10 gün düşük: ' + min10 + '₺  |  Yüksek: ' + max10 + '₺\n' +
    'MA7: ' + ma7 + '₺' + (ma20 ? '  |  MA20: ' + ma20 + '₺' : '') + '\n' +
    'Son 5 gün yön: ' + yonler + '\n' +
    'RSI (14): ' + (veri.rsi?.toFixed(1) ?? '—') + '\n' +
    'MACD Histogram: ' + (veri.macdHist?.toFixed(3) ?? '—') + '\n' +
    'Bollinger %: ' + (veri.bollinger?.yuzde?.toFixed(1) ?? '—') + '\n' +
    'Güven Skoru: ' + (veri.guvenSkoru ?? '—') + '%\n' +
    'Mevcut Sinyal: ' + veri.sinyal + '\n\n' +
    'Şunları belirt:\n1. Trend: Yönü ve gücü\n2. Kritik Seviyeler: Destek ve direnç (₺)\n' +
    '3. Önümüzdeki 1-2 hafta beklenti\n4. Sinyal değerlendirmesi\n\nTürkçe. Rakam bazlı. 5-6 cümle.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return text;
  } catch (e) {
    console.error('aiGrafikAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return '';
  }
}

// ─────────────────────────────────────────────
// KAP — BİLDİRİMLERİ ÇEK
// ─────────────────────────────────────────────

export async function fetchKapBildirimleri(sonrasiIndex = null) {
  try {
    const url  = sonrasiIndex ? KAP_PROXY + '?sonrasi=' + sonrasiIndex : KAP_PROXY;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.error) { console.warn('KAP API uyarısı:', json.error); return []; }
    return Array.isArray(json.bildirimler) ? json.bildirimler : [];
  } catch (e) { console.error('fetchKapBildirimleri hatası:', e); return []; }
}

export async function fetchKapDetay(disclosureId) {
  try {
    const res = await fetch(PROXY + '?kapdetay=' + encodeURIComponent(disclosureId));
    return await res.json();
  } catch (e) { console.error('fetchKapDetay hatası:', e); return null; }
}

// ─────────────────────────────────────────────
// KAP — FİRESTORE CACHE
// ─────────────────────────────────────────────

export async function kapAnalizCache({ db, currentUser, bildirimHash }) {
  if (!currentUser || !bildirimHash) return null;
  try {
    const ref  = doc(db, 'kapAnalizleri', bildirimHash);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

export async function kapAnalizKaydet({ db, currentUser, bildirimHash, bildirim, analiz }) {
  if (!currentUser || !bildirimHash) return null;
  try {
    const kayit = {
      bildirimHash,
      bildirimBaslik: bildirim.baslik || '',
      bildirimTarih:  bildirim.tarih  || '',
      sirket:         bildirim.sirket || '',
      kodlar:         bildirim.kodlar || [],
      tip:            bildirim.tip    || '',
      yorum:          analiz.yorum    || '',
      onem:           analiz.onem     || 'normal',
      hisseler:       analiz.hisseler || [],
      kullaniciUid:   currentUser.uid,
      kullaniciAd:    currentUser.displayName || '',
      tarih:          Date.now(),
    };
    await setDoc(doc(db, 'kapAnalizleri', bildirimHash), kayit);
    return kayit;
  } catch (e) { console.error('kapAnalizKaydet hatası:', e); return null; }
}

export function kapHashOlustur(bildirim) {
  const str = (bildirim.index || '') + '_' + (bildirim.tarih || '') + '_' + (bildirim.sirket || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return 'kap_' + Math.abs(hash).toString(36);
}

// ─────────────────────────────────────────────
// CLAUDE AI — KAP BİLDİRİM ANALİZİ
// ─────────────────────────────────────────────

export async function aiKapAnalizEt({ key, bildirim, takipEdilen = new Set(), portfoy = {} }) {
  if (!key || !bildirim) return null;

  const takipKodlar       = [...takipEdilen];
  const portfoyKodlar     = Object.keys(portfoy);
  const ilgiliKodlar      = bildirim.kodlar || [];
  const portfoydekiIlgili = ilgiliKodlar.filter(k => portfoyKodlar.includes(k));
  const takiptekiIlgili   = ilgiliKodlar.filter(k => takipKodlar.includes(k) && !portfoydekiIlgili.includes(k));
  const portfoyBilgi      = portfoydekiIlgili.length > 0
    ? 'Kullanıcının portföyündeki ilgili hisseler: ' +
      portfoydekiIlgili.map(k => k + ' (' + portfoy[k].adet + ' adet, alış: ' + portfoy[k].alisFiyati + '₺)').join(', ')
    : '';

  const prompt =
    'KAP bildirimi analizi yap.\n\nBİLDİRİM:\n' +
    'Şirket: ' + bildirim.sirket + '\n' +
    'Hisse Kodları: ' + (ilgiliKodlar.join(', ') || '—') + '\n' +
    'Tür: ' + (bildirim.tip || '—') + ' / ' + (bildirim.tipAciklama || '—') + '\n' +
    'Başlık: ' + bildirim.baslik + '\n' +
    'Özet: ' + (bildirim.ozet || 'Özet yok, başlıktan çıkar.') + '\n\n' +
    (portfoyBilgi ? portfoyBilgi + '\n\n' : '') +
    'Takip edilen diğer ilgili hisseler: ' + (takiptekiIlgili.join(', ') || 'yok') + '\n\n' +
    'JSON ile yanıtla:\n{"yorum":"...","onem":"kritik|onemli|normal","hisseler":[{"kod":"XXXX","etki":"olumlu|olumsuz|nötr","aciklama":"..."}]}';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('aiKapAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return null;
  }
}

// ─────────────────────────────────────────────
// KAP — POLLING STATE
// ─────────────────────────────────────────────

let _kapSonIndex = null;
export function kapSonIndexAl()        { return _kapSonIndex; }
export function kapSonIndexKaydet(idx) { _kapSonIndex = idx; }

// ─────────────────────────────────────────────
// CLAUDE AI — PORTFÖY ANALİZİ
// ─────────────────────────────────────────────

export async function aiPortfoyAnalizYap({ key, veriler, takipEdilen, sinyalGecmisi = [], piyasaVerisi = {} }) {
  if (!key || takipEdilen.size === 0) return '';

  const dogru   = sinyalGecmisi.filter(s => s.dogrulandi === true).length;
  const yanlis  = sinyalGecmisi.filter(s => s.dogrulandi === false).length;
  const toplam  = dogru + yanlis;
  const isabet  = toplam > 0 ? Math.round(dogru / toplam * 100) : null;

  const basariliPatternler  = sinyalGecmisi.filter(s => s.dogrulandi === true)
    .map(s => 'RSI=' + s.rsi?.toFixed(0) + ',MACD=' + s.macd?.toFixed(3) + ',Hacim=' + s.hacimFark + '%,Sinyal=' + s.sinyal)
    .slice(0, 10).join('\n');
  const basarisizPatternler = sinyalGecmisi.filter(s => s.dogrulandi === false)
    .map(s => 'RSI=' + s.rsi?.toFixed(0) + ',MACD=' + s.macd?.toFixed(3) + ',Hacim=' + s.hacimFark + '%,Sinyal=' + s.sinyal + ',Sonuç=' + s.sonucYuzde?.toFixed(1) + '%')
    .slice(0, 10).join('\n');
  const guncelVeri = Object.entries(veriler).filter(([k]) => takipEdilen.has(k))
    .map(([k, v]) => k + ': Fiyat=' + v.fiyat + '₺, RSI=' + v.rsi + ', MACD_hist=' + v.macdHist?.toFixed(3) +
      ', Hacim=' + (v.hacimFark > 0 ? '+' : '') + v.hacimFark + '%, MA20=' + v.ma20 + ', MA50=' + v.ma50 + ', Sinyal=' + v.sinyal).join('\n');
  const piyasaBaglam = piyasaVerisi.xu100
    ? 'BIST100: ' + piyasaVerisi.xu100.fiyat?.toLocaleString() +
      ' (' + (piyasaVerisi.xu100.degisim >= 0 ? '+' : '') + piyasaVerisi.xu100.degisim + '%), USD/TRY: ' + piyasaVerisi.usdtry?.fiyat?.toFixed(2)
    : '';
  const gecmisStr = toplam > 0
    ? 'GEÇMIŞ SİNYAL PERFORMANSI:\nToplam: ' + toplam + ' | İsabet: %' + isabet + '\n' +
      'Başarılı: ' + (basariliPatternler || 'Henüz yok') + '\nBaşarısız: ' + (basarisizPatternler || 'Henüz yok')
    : 'İlk analiz — geçmiş veri henüz yok.';

  const prompt =
    'Sen tecrübeli bir BIST teknik analiz uzmanısın.\n\n' +
    (piyasaBaglam ? 'GENEL PİYASA:\n' + piyasaBaglam + '\n\n' : '') +
    gecmisStr + '\n\nGÜNCEL VERİLER:\n' + guncelVeri +
    '\n\n1. Öne çıkan fırsatlar ve riskler\n2. Geçmiş başarısız örüntüler\n3. Hacim-fiyat ilişkisi\n4. Max 5 madde, Türkçe, net';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 800);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return text;
  } catch (e) {
    console.error('aiPortfoyAnalizYap hatası:', e);
    _notify(_apiHataYonet(e));
    return '';
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — HİSSE ANALİZİ
// ─────────────────────────────────────────────

export async function aiHisseAnalizEt({ key, kod, veri, sinyalGecmisi = [], piyasaVerisi = {}, portfoy = {}, haberlerData = [], bistListesi = [] }) {
  if (!key || !veri) return null;

  const gecmis = sinyalGecmisi.filter(s => s.sembol === kod).slice(0, 5)
    .map(s => 'Tarih:' + new Date(s.tarih).toLocaleDateString('tr-TR') +
      ' Sinyal:' + s.sinyal +
      ' Sonuç:' + (s.dogrulandi === true ? '✓ Doğru' : s.dogrulandi === false ? '✗ Yanlış' : 'Bekliyor') +
      (s.sonucYuzde != null ? ' (' + (s.sonucYuzde > 0 ? '+' : '') + s.sonucYuzde + '%)' : '')).join('\n');

  const portfoyBilgi    = portfoy[kod] ? 'Portföyde: ' + portfoy[kod].adet + ' adet, alış: ' + portfoy[kod].alisFiyati + '₺' : 'Portföyde yok';
  const ilgiliHaberler  = haberlerData.filter(h => h.baslik?.includes(kod) || h.aciklama?.includes(kod))
    .slice(0, 2).map(h => '• ' + h.baslik).join('\n');

  const prompt =
    'HİSSE: ' + kod + '\nFiyat: ' + veri.fiyat + '₺ (' + (veri.degisim >= 0 ? '+' : '') + veri.degisim + '%)\n' +
    'RSI: ' + (veri.rsi?.toFixed(1) ?? '—') + '\nMACD Hist: ' + (veri.macdHist?.toFixed(3) ?? '—') + '\n' +
    'MA20/MA50: ' + (veri.ma20 ?? '—') + ' / ' + (veri.ma50 ?? '—') + '\n' +
    'Bollinger %: ' + (veri.bollinger?.yuzde?.toFixed(1) ?? '—') + '\nHacim Farkı: ' + veri.hacimFark + '%\n' +
    'Mevcut Sinyal: ' + veri.sinyal + '\n' + portfoyBilgi + '\n\n' +
    (gecmis ? 'GEÇMİŞ SİNYALLER:\n' + gecmis + '\n\n' : '') +
    (ilgiliHaberler ? 'İLGİLİ HABERLER:\n' + ilgiliHaberler + '\n\n' : '') +
    'Kısa ve net teknik analiz yap. Risk ve fırsatları belirt. Türkçe, max 4 madde.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return { metin: text, tarih: Date.now(), sembol: kod, fiyat: veri.fiyat };
  } catch (e) {
    console.error('aiHisseAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return null;
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — HABER ANALİZİ
// ─────────────────────────────────────────────

export async function aiHaberAnalizEt({ key, haber, takipEdilen }) {
  if (!key || !haber) return null;
  const prompt =
    'Aşağıdaki finansal haberi analiz et.\n\nHABER BAŞLIĞI: ' + haber.baslik + '\n' +
    'ÖZET: ' + (haber.aciklama || '') + '\n\nTAKİP EDİLEN: ' + ([...takipEdilen].join(', ') || 'Belirtilmedi') + '\n\n' +
    'JSON: {"hisseler":[{"kod":"THYAO","etki":"olumlu|olumsuz|notr","tip":"direkt|dolayli"}],"yorum":"...","sure":"kısa|orta|uzun"}';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 500);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('aiHaberAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return null;
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — TERİM AÇIKLAMA
// ─────────────────────────────────────────────

export async function aiTerimAcikla({ key, terim }) {
  if (!key || !terim) return '';
  const prompt = 'Borsa terimi olarak "' + terim + '" nedir?\nTürkçe, sade, 2-3 cümle.';
  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 300);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return text;
  } catch (e) {
    console.error('aiTerimAcikla hatası:', e);
    _notify(_apiHataYonet(e));
    return '';
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — GÜN SONU ÖZETİ
// Arşivleme özelliği eklendi
// ─────────────────────────────────────────────

export async function aiGunSonuOzeti({ key, analizler, currentUser = null, db: dbRef = null }) {
  if (!key || !analizler?.length) return { text: '' };

  const ozet = analizler.slice(0, 20)
    .map(a => a.haberBaslik + ': ' + (a.yorum || '') +
      ' | Hisseler: ' + (a.hisseler?.map(x => x.kod + '(' + x.etki + ')').join(',') || '—')).join('\n');

  const prompt =
    'Bugünkü ' + analizler.length + ' haber analizine göre BIST gün sonu özeti:\n\n' +
    'ANALİZLER:\n' + ozet + '\n\nKısa (max 150 kelime), Türkçe, push bildirim formatında.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 400);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}

    // Arşivle
    if (dbRef && text) {
      try {
        await addDoc(collection(dbRef, 'gunSonuOzetleri'), {
          metin:    text,
          tarih:    Date.now(),
          gun:      new Date().toISOString().split('T')[0],
          gonderen: currentUser?.uid || 'sistem',
        });
      } catch (_) {}
    }

    return { text };
  } catch (e) {
    console.error('aiGunSonuOzeti hatası:', e);
    _notify(_apiHataYonet(e));
    return { text: '' };
  }
}

// ─────────────────────────────────────────────
// API & FİREBASE HATA YÖNETİMİ
// ─────────────────────────────────────────────

function _apiHataYonet(e) {
  if (e?.message === 'API_KEY_INVALID')    return '⚠️ AI erişiminiz tanımlı değil veya geçersiz.';
  if (e?.message === 'API_QUOTA_EXCEEDED') return '⚠️ AI kullanım limitiniz doldu.';
  if (e?.message === 'API_TIMEOUT')        return '⚠️ AI yanıt vermedi (zaman aşımı).';
  return 'AI analizi yapılamadı: ' + (e?.message || 'Bağlantı hatası');
}

export function firebaseHataYonet(e) {
  const kod = e?.code || '';
  if (kod === 'permission-denied'   || kod === 'firestore/permission-denied')   return 'Erişim reddedildi. Tekrar giriş yapın.';
  if (kod === 'unavailable'         || kod === 'firestore/unavailable')         return 'Firebase bağlantısı kesildi.';
  if (kod === 'deadline-exceeded'   || kod === 'firestore/deadline-exceeded')   return 'Firebase yanıt vermedi (zaman aşımı).';
  if (kod === 'not-found'           || kod === 'firestore/not-found')           return 'Veri bulunamadı.';
  if (kod === 'unauthenticated'     || kod === 'firestore/unauthenticated')     return 'Oturum süresi dolmuş.';
  return e?.message || 'Firebase hatası.';
}

// ─────────────────────────────────────────────
// FİRESTORE — TOKEN KULLANIM
// ─────────────────────────────────────────────

export async function tokenKaydet({ currentUser, tokens }) {
  if (!tokens) return;
  const uid   = currentUser?.uid   || 'sistem';
  const email = currentUser?.email || 'sistem';
  const ad    = currentUser?.displayName || 'Sistem';
  try {
    const ay     = new Date().toISOString().slice(0, 7);
    const ref    = doc(db, 'tokenKullanim', uid + '_' + ay);
    const snap   = await getDoc(ref);
    const mevcut = snap.exists() ? snap.data() : { uid, email, ad, ay, toplamToken: 0, istekSayisi: 0, maliyet: 0 };
    const yeniToken = mevcut.toplamToken + tokens;
    await setDoc(ref, {
      ...mevcut,
      toplamToken:   yeniToken,
      istekSayisi:   mevcut.istekSayisi + 1,
      maliyet:       +(yeniToken * TOKEN_MALIYET).toFixed(4),
      sonGuncelleme: Date.now(),
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL KAYDET
// ─────────────────────────────────────────────

export async function sinyalKaydet({ db, currentUser, veriler, takipEdilen, aiYorum = '' }) {
  if (!currentUser) return;
  const ts    = Date.now();
  const bugun = new Date().toISOString().split('T')[0];

  for (const [k, v] of Object.entries(veriler)) {
    if (!takipEdilen.has(k)) continue;
    const item = {
      uid: currentUser.uid, sembol: k, tarih: ts, gun: bugun,
      fiyat: v.fiyat, rsi: v.rsi, macd: v.macdHist, hacimFark: v.hacimFark,
      ma20: v.ma20, ma50: v.ma50, sinyal: v.sinyal, aiYorum,
      sonuc: null, sonucFiyat: null, sonucYuzde: null, dogrulandi: null,
    };
    try {
      const mevcutQ = query(
        collection(db, 'sinyaller'),
        where('uid', '==', item.uid), where('sembol', '==', item.sembol), where('gun', '==', bugun)
      );
      const snap = await getDocs(mevcutQ);
      if (!snap.empty) {
        await updateDoc(doc(db, 'sinyaller', snap.docs[0].id), {
          fiyat: item.fiyat, rsi: item.rsi, macd: item.macd,
          hacimFark: item.hacimFark, ma20: item.ma20, ma50: item.ma50,
          sinyal: item.sinyal, tarih: item.tarih,
        });
      } else {
        await addDoc(collection(db, 'sinyaller'), item);
      }
    } catch (e) { console.error('sinyalKaydet hatası:', k, e); }
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL GEÇMİŞİ
// ─────────────────────────────────────────────

export async function loadSinyalGecmisi({ db, currentUser }) {
  if (!currentUser) return [];
  try {
    const q    = query(collection(db, 'sinyaller'), where('uid', '==', currentUser.uid), orderBy('tarih', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('loadSinyalGecmisi hatası:', e);
    _notify('Sinyal geçmişi yüklenemedi.');
    return [];
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL DOĞRULAMA
// ─────────────────────────────────────────────

export async function sinyalleriDogrula({ db, sinyalGecmisi, dogrulamaGun, piyasaYon }) {
  const gunOnce     = Date.now() - dogrulamaGun * 24 * 60 * 60 * 1000;
  const bekleyenler = sinyalGecmisi.filter(s => s.sonuc === null && s.tarih < gunOnce);

  for (const sinyal of bekleyenler) {
    const v = await fetchYahoo(sinyal.sembol, piyasaYon);
    if (!v) continue;
    const sonucYuzde = +((v.fiyat - sinyal.fiyat) / sinyal.fiyat * 100).toFixed(2);
    let dogrulandi   = null;
    if      (['AL', 'GÜÇLÜ AL'].includes(sinyal.sinyal))   dogrulandi = sonucYuzde > 0;
    else if (['SAT', 'GÜÇLÜ SAT'].includes(sinyal.sinyal)) dogrulandi = sonucYuzde < 0;
    else    dogrulandi = Math.abs(sonucYuzde) < 3;
    try {
      await updateDoc(doc(db, 'sinyaller', sinyal.id), { sonuc: 'tamamlandi', sonucFiyat: v.fiyat, sonucYuzde, dogrulandi });
      sinyal.sonuc = 'tamamlandi'; sinyal.sonucFiyat = v.fiyat; sinyal.sonucYuzde = sonucYuzde; sinyal.dogrulandi = dogrulandi;
    } catch (e) { console.error('sinyalleriDogrula hatası:', e); }
    await sleep(300);
  }
  return sinyalGecmisi;
}

// ─────────────────────────────────────────────
// FİRESTORE — MÜKERRERLERİ TEMİZLE
// ─────────────────────────────────────────────

export async function mukerrerSinyalleriTemizle({ db }) {
  const snap        = await getDocs(collection(db, 'sinyaller'));
  const tumKayitlar = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const gruplar     = {};
  tumKayitlar.forEach(k => {
    const gun     = k.gun || new Date(k.tarih).toISOString().split('T')[0];
    const anahtar = k.uid + '_' + k.sembol + '_' + gun;
    if (!gruplar[anahtar]) gruplar[anahtar] = [];
    gruplar[anahtar].push(k);
  });
  let silinenSayisi = 0;
  for (const grup of Object.values(gruplar)) {
    if (grup.length <= 1) continue;
    grup.sort((a, b) => b.tarih - a.tarih);
    for (let i = 1; i < grup.length; i++) {
      await deleteDoc(doc(db, 'sinyaller', grup[i].id));
      silinenSayisi++;
    }
  }
  return silinenSayisi;
}

// ─────────────────────────────────────────────
// FİRESTORE — KULLANICI VERİSİ
// ─────────────────────────────────────────────

export async function saveUserData({ db, currentUser, takipEdilen, portfoy, veriler }) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { takipEdilen: [...takipEdilen], portfoy, veriler });
  } catch (e) {
    console.error('saveUserData hatası:', e);
    _notify('Verileriniz kaydedilemedi: ' + firebaseHataYonet(e), 'error');
    throw e;
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — PUSH MESAJLARI
// 24 saat içinde tekrar okunabilsin
// ─────────────────────────────────────────────

export async function pushMesajGonder({ db, currentUser, baslik, mesaj }) {
  try {
    await addDoc(collection(db, 'pushMesajlar'), {
      baslik, mesaj, tarih: Date.now(), gonderen: currentUser.uid, okundu: {},
    });
  } catch (e) {
    console.error('pushMesajGonder hatası:', e);
    _notify('Push mesajı gönderilemedi: ' + (e?.message || 'Firebase hatası'));
    throw e;
  }
}

export async function checkPushMesajlar({ db, currentUser, onMesaj }) {
  if (!currentUser) return [];
  try {
    const q       = query(collection(db, 'pushMesajlar'), orderBy('tarih', 'desc'), limit(10));
    const snap    = await getDocs(q);
    const mesajlar = [];

    snap.docs.forEach(d => {
      const m = d.data();
      if (Date.now() - m.tarih > 24 * 60 * 60 * 1000) return; // 24 saat dışı
      mesajlar.push({ id: d.id, ...m });

      // Okunmamışsa göster
      if (!m.okundu?.[currentUser.uid]) {
        setTimeout(() => onMesaj(m.baslik, m.mesaj), 2000);
        updateDoc(doc(db, 'pushMesajlar', d.id), {
          ['okundu.' + currentUser.uid]: true,
        }).catch(() => {});
      }
    });

    return mesajlar;
  } catch (e) {
    console.error('checkPushMesajlar hatası:', e);
    return [];
  }
}

// Bildirim merkezi için tüm push mesajlarını yükle
export async function loadPushMesajlar({ db }) {
  try {
    const q    = query(collection(db, 'pushMesajlar'), orderBy('tarih', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('loadPushMesajlar hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — SÖZLÜK
// ─────────────────────────────────────────────

export async function loadSozluk({ db }) {
  try {
    const q    = query(collection(db, 'sozluk'), orderBy('sorulma', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('loadSozluk hatası:', e);
    _notify('Sözlük yüklenemedi.');
    throw e;
  }
}

export async function sozlukTerimKaydet({ db, terim, aciklama, currentUser }) {
  const yeni = { terim, aciklama, sorulma: 1, tarih: Date.now(), kullanici: currentUser?.displayName || currentUser?.email || 'Anonim' };
  const ref  = await addDoc(collection(db, 'sozluk'), yeni);
  return { id: ref.id, ...yeni };
}

export async function sozlukSorulmaSayisiArtir({ db, mevcutId, mevcutSorulma }) {
  await updateDoc(doc(db, 'sozluk', mevcutId), { sorulma: (mevcutSorulma || 0) + 1 });
}

// ─────────────────────────────────────────────
// FİRESTORE — HİSSE ANALİZ CACHE
// ─────────────────────────────────────────────

export async function hisseAnalizCache({ db, currentUser, sembol }) {
  if (!currentUser || !sembol) return null;
  try {
    const ref  = doc(db, 'hisseAnalizleri', currentUser.uid + '_' + sembol);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    if (Date.now() - d.tarih > 24 * 60 * 60 * 1000) return null;
    return d;
  } catch (e) { console.error('hisseAnalizCache hatası:', e); return null; }
}

// ─────────────────────────────────────────────
// FİRESTORE — HİSSE ANALİZ KAYDET
// Her analiz ayrı arşiv kaydı olarak saklanır.
// Kullanıcı başına ARSIV_LIMIT (30) kaydı aşılırsa
// en eski kayıt silinerek yerine yazılır.
// ─────────────────────────────────────────────

export async function hisseAnalizKaydet({ db, currentUser, sembol, analiz }) {
  if (!currentUser || !sembol || !analiz) return null;
  try {
    const kayit = {
      sembol,
      uid:          currentUser.uid,
      tarih:        Date.now(),
      gun:          new Date().toISOString().split('T')[0],
      metin:        analiz.metin     || '',
      karar:        analiz.karar     || null,
      hedef:        analiz.hedef     || null,
      destek:       analiz.destek    || null,
      stopLoss:     analiz.stopLoss  || null,
      risk:         analiz.risk      || null,
      ozet:         analiz.ozet      || null,
      fiyatAninda:  analiz.fiyat     || null,
      sonucFiyat:   null,
      sonucYuzde:   null,
      dogrulandi:   null,
    };

    // 1. Kullanıcının mevcut arşiv sayısını kontrol et
    const arsivQ = query(
      collection(db, 'analizArsivi'),
      where('uid', '==', currentUser.uid),
      orderBy('tarih', 'asc'),
    );
    const arsivSnap = await getDocs(arsivQ);

    // Limit aşıldıysa en eski kaydı sil
    if (arsivSnap.size >= ARSIV_LIMIT) {
      const enEski = arsivSnap.docs[0];
      await deleteDoc(doc(db, 'analizArsivi', enEski.id));
      _notify('Analiz arşiviniz doldu (30 kayıt). En eski analiz silindi.', 'success');
    }

    // 2. Yeni arşiv kaydı ekle
    const arsivRef = await addDoc(collection(db, 'analizArsivi'), kayit);

    // 3. Cache güncelle (hızlı okuma için)
    await setDoc(
      doc(db, 'hisseAnalizleri', currentUser.uid + '_' + sembol),
      { ...kayit, arsivId: arsivRef.id }
    );

    return { id: arsivRef.id, ...kayit };
  } catch (e) {
    console.error('hisseAnalizKaydet hatası:', e);
    return null;
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — ANALİZ ARŞİVİ YÜKLE
// ─────────────────────────────────────────────

export async function analizArsivYukle({ db, currentUser, sembol = null, limitSayisi = 50 }) {
  if (!currentUser) return [];
  try {
    let q;
    if (sembol) {
      q = query(
        collection(db, 'analizArsivi'),
        where('uid',    '==', currentUser.uid),
        where('sembol', '==', sembol),
        orderBy('tarih', 'desc'),
        limit(limitSayisi)
      );
    } else {
      q = query(
        collection(db, 'analizArsivi'),
        where('uid', '==', currentUser.uid),
        orderBy('tarih', 'desc'),
        limit(limitSayisi)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('analizArsivYukle hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — ANALİZ TUTARLILIK GÜNCELLE
// Belirtilen gün öncesine ait analizlerin
// sonucunu güncel fiyatla karşılaştırır.
// ─────────────────────────────────────────────

export async function analizTutarlilikGuncelle({ db, currentUser, gunOncesi = 5 }) {
  if (!currentUser) return 0;
  try {
    const esik = Date.now() - gunOncesi * 24 * 60 * 60 * 1000;
    const q    = query(
      collection(db, 'analizArsivi'),
      where('uid',        '==', currentUser.uid),
      where('dogrulandi', '==', null),
    );
    const snap = await getDocs(q);
    let guncellenen = 0;

    for (const d of snap.docs) {
      const veri = d.data();
      if (veri.tarih > esik)    continue; // henüz yeterli süre geçmemiş
      if (!veri.fiyatAninda)    continue; // fiyat bilgisi yok

      const guncel = await fetchYahoo(veri.sembol, 0);
      if (!guncel?.fiyat) continue;

      const sonucYuzde = +((guncel.fiyat - veri.fiyatAninda) / veri.fiyatAninda * 100).toFixed(2);
      let dogrulandi   = null;

      if      (['AL', 'GÜÇLÜ AL'].includes(veri.karar))    dogrulandi = sonucYuzde > 0;
      else if (['ALMA', 'GÜÇLÜ SAT'].includes(veri.karar)) dogrulandi = sonucYuzde < 0;
      else if (veri.hedef && guncel.fiyat >= veri.hedef)   dogrulandi = true;

      await updateDoc(doc(db, 'analizArsivi', d.id), { sonucFiyat: guncel.fiyat, sonucYuzde, dogrulandi });
      guncellenen++;
      await sleep(200);
    }
    return guncellenen;
  } catch (e) {
    console.error('analizTutarlilikGuncelle hatası:', e);
    return 0;
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — GÜN SONU ÖZETLERİ
// ─────────────────────────────────────────────

export async function loadGunSonuOzetleri({ db, limitSayisi = 10 }) {
  try {
    const q    = query(collection(db, 'gunSonuOzetleri'), orderBy('tarih', 'desc'), limit(limitSayisi));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('loadGunSonuOzetleri hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — HABER ANALİZ CACHE
// ─────────────────────────────────────────────

export function haberHashOlustur(baslik) {
  let hash = 0;
  for (let i = 0; i < baslik.length; i++) {
    hash = ((hash << 5) - hash) + baslik.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function haberAnalizCache({ db, currentUser, haberHash }) {
  if (!currentUser) return null;
  try {
    const ref  = doc(db, 'haberAnalizleri', haberHash);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function haberAnalizKaydet({ db, currentUser, haberHash, analiz, haber, takipEdilen }) {
  try {
    const kayit = {
      haberHash,
      haberBaslik: haber.baslik,
      yorum:       analiz.yorum    || '',
      hisseler:    analiz.hisseler || [],
      sure:        analiz.sure     || '',
      tarih:       Date.now(),
      uid:         currentUser.uid,
      kullaniciAd: currentUser.displayName || currentUser.email,
      takipEdilen: [...takipEdilen],
    };
    await setDoc(doc(db, 'haberAnalizleri', haberHash), kayit, { merge: true });
    return kayit;
  } catch (e) {
    console.error('haberAnalizKaydet hatası:', e);
    return null;
  }
}