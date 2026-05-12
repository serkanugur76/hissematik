// ══════════════════════════════════════════════
// HisseMatik — API & Network Katmanı
// assets/js/api.js
//
// Tek sorumluluk: dış dünyayla konuşmak.
//   • Yahoo Finance proxy (fiyat, geçmiş, piyasa, haberler)
//   • Claude AI (portföy analizi, hisse analizi, haber analizi, sözlük)
//   • Firestore CRUD (sinyal, token, kullanıcı, push)
//
// Bağımlılıklar:
//   ← firebase.js   (db, auth helpers)
//   ← indicators.js (parseYahooVeri, genelSinyal)
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
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_VER = '2023-06-01';
const MODEL      = 'claude-sonnet-4-6';

/** Token başına yaklaşık maliyet (USD) */
const TOKEN_MALIYET = 0.000003;

// ─────────────────────────────────────────────
// TOAST CALLBACK
// api.js DOM'a dokunamaz; ui.js'deki showToast'u
// app.js'in başlatma sırasında buraya bağlar.
// ─────────────────────────────────────────────

let _toast = null;
export function setApiToast(fn) { _toast = fn; }
function _notify(mesaj, tip = 'error') {
  if (_toast) _toast(mesaj, tip);
  else        console.error('[api]', mesaj);
}

// ─────────────────────────────────────────────
// ŞİFRELEME — Web Crypto API (AES-GCM)
//
// Şifreleme anahtarı kullanıcının uid'inden türetilir.
// Sadece o kullanıcı kendi key'ini çözebilir.
// Firestore'da encryptedApiKey alanında tutulur.
// ─────────────────────────────────────────────

/**
 * uid'den AES-GCM CryptoKey türet.
 * Her çağrıda aynı uid → aynı key üretilir (deterministik).
 */
async function _uiddenAnahtar(uid) {
  const enc     = new TextEncoder();
  const keyMat  = await crypto.subtle.importKey(
    'raw', enc.encode(uid), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       enc.encode('hissematik-salt-v1'),
      iterations: 100_000,
      hash:       'SHA-256',
    },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * API key'i şifrele → base64 string döner (iv + ciphertext).
 * @param {string} apiKey  — düz metin Anthropic key
 * @param {string} uid     — Firebase kullanıcı uid
 * @returns {Promise<string>}
 */
export async function apiKeyEncrypt(apiKey, uid) {
  const key    = await _uiddenAnahtar(uid);
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const enc    = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(apiKey),
  );
  // iv + ciphertext → base64
  const buf = new Uint8Array(iv.byteLength + cipher.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...buf));
}

/**
 * Şifreli base64 string'i çöz → düz metin API key döner.
 * @param {string} encrypted — base64 şifreli key
 * @param {string} uid       — Firebase kullanıcı uid
 * @returns {Promise<string>}
 */
export async function apiKeyDecrypt(encrypted, uid) {
  try {
    const key    = await _uiddenAnahtar(uid);
    const buf    = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv     = buf.slice(0, 12);
    const data   = buf.slice(12);
    const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — KULLANICI API KEY KAYDET (Admin)
//
// Admin bir kullanıcıya key tanımlarken çağırır.
// Key şifrelenerek users/{targetUid}.encryptedApiKey'e yazılır.
// ─────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string} p.targetUid  — key tanımlanacak kullanıcının uid'i
 * @param {string} p.apiKey     — düz metin Anthropic key
 * @param {boolean} p.isAdmin   — işlemi yapan admin mi? (güvenlik kontrolü)
 */
export async function saveUserApiKey({ targetUid, apiKey, isAdmin }) {
  if (!isAdmin) {
    _notify('Bu işlem için admin yetkisi gerekli.', 'error');
    return;
  }
  if (!targetUid || !apiKey) {
    _notify('Kullanıcı UID veya API key eksik.', 'error');
    return;
  }
  try {
    const encrypted = await apiKeyEncrypt(apiKey, targetUid);
    await updateDoc(doc(db, 'users', targetUid), {
      encryptedApiKey: encrypted,
      apiKeySet:       true,
      apiKeyTarih:     Date.now(),
    });
  } catch (e) {
    console.error('saveUserApiKey hatası:', e);
    _notify('API anahtarı kaydedilemedi: ' + (e?.message || 'Firebase hatası'));
    throw e;
  }
}

/**
 * Oturum açan kullanıcının kendi şifreli key'ini çöz ve döndür.
 * @param {object} p
 * @param {string} p.uid           — oturum açan kullanıcının uid'i
 * @param {string} p.encryptedKey  — Firestore'dan gelen encryptedApiKey
 * @returns {Promise<string>}      — düz metin key veya ''
 */
export async function loadUserApiKey({ uid, encryptedKey }) {
  if (!uid || !encryptedKey) return '';
  return apiKeyDecrypt(encryptedKey, uid);
}

// ─────────────────────────────────────────────
// YARDIMCI
// ─────────────────────────────────────────────

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** API anahtarını temizle (sadece izin verilen karakterler) */
function temizleKey(key) {
  return (key || '').replace(/[^a-zA-Z0-9\-_]/g, '').trim();
}

/**
 * Claude'a istek at — ham metin + token sayısı döner.
 * @param {string}   key      — Anthropic API key
 * @param {object[]} mesajlar — messages dizisi
 * @param {number}   maxToken — max_tokens (varsayılan 1000)
 * @param {number}   zaman    — ms timeout (varsayılan 25 sn)
 */
async function claudeIste(key, mesajlar, maxToken = 1000, zaman = 25000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), zaman);

  let res;
  try {
    res = await fetch(CLAUDE_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               temizleKey(key),
        'anthropic-version':       CLAUDE_VER,
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
// YAHOO FINANCE — TEK HİSSE
// ─────────────────────────────────────────────

export async function fetchYahoo(sembol, piyasaYon = 0) {
  try {
    const url  = PROXY + '?sembol=' + encodeURIComponent(sembol + '.IS');
    const res  = await fetch(url);
    const json = await res.json();
    const raw  = json?.chart?.result?.[0];
    if (!raw) return null;
    return parseYahooVeri(raw, piyasaYon);
  } catch (e) {
    console.error('fetchYahoo hatası:', sembol, e);
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO FINANCE — TOPLU HİSSE (takip listesi)
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// YAHOO FINANCE — TÜM HİSSE FİYATLARI (anlık)
// ─────────────────────────────────────────────

export async function fetchTumHisseFiyatlari() {
  try {
    const res  = await fetch(PROXY + '?tumfiyatlar=1');
    const json = await res.json();
    return Array.isArray(json?.hisseler) ? json.hisseler : [];
  } catch (e) {
    console.error('fetchTumHisseFiyatlari hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// YAHOO FINANCE — PİYASA GENEL VERİSİ
// ─────────────────────────────────────────────

export async function fetchPiyasaVerisi() {
  try {
    const res = await fetch(PROXY + '?piyasa=1');
    return await res.json();
  } catch (e) {
    console.error('fetchPiyasaVerisi hatası:', e);
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO FINANCE — HABERLER
// ─────────────────────────────────────────────

export async function fetchHaberler() {
  try {
    const res  = await fetch(PROXY + '?haberler=1');
    const json = await res.json();
    return Array.isArray(json?.haberler) ? json.haberler : [];
  } catch (e) {
    console.error('fetchHaberler hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// KAP — BİLDİRİMLERİ ÇEK
//
// kap.org.tr/tr/api/disclosures endpoint'inden
// bildirimleri proxy üzerinden çeker.
//
// @param {number|null} sonrasiIndex  — polling için
//   son alınan disclosureIndex. null ise tüm son
//   bildirimleri getirir.
// @returns {Promise<Array>}  normalize edilmiş bildirim dizisi
// ─────────────────────────────────────────────
export async function fetchKapBildirimleri(sonrasiIndex = null) {
  try {
    const url = sonrasiIndex
      ? PROXY + '?kap=1&sonrasi=' + sonrasiIndex
      : PROXY + '?kap=1';

    const res  = await fetch(url);
    const json = await res.json();

    if (json.error) {
      console.warn('KAP API uyarısı:', json.error);
      return [];
    }

    return Array.isArray(json.bildirimler) ? json.bildirimler : [];
  } catch (e) {
    console.error('fetchKapBildirimleri hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// KAP — BİLDİRİM DETAYINI ÇEK
//
// Tek bir bildirimin tam içeriğini getirir.
// @param {string} disclosureId
// ─────────────────────────────────────────────
export async function fetchKapDetay(disclosureId) {
  try {
    const url = PROXY + '?kapdetay=' + encodeURIComponent(disclosureId);
    const res  = await fetch(url);
    return await res.json();
  } catch (e) {
    console.error('fetchKapDetay hatası:', e);
    return null;
  }
}

// ─────────────────────────────────────────────
// KAP — FİRESTORE CACHE (hisse bazlı)
//
// Aynı bildirimi tekrar analiz ettirmemek için
// Firestore'da kapAnalizleri/{hash} koleksiyonunda
// saklıyoruz. Yapı haber analizleriyle aynı.
// ─────────────────────────────────────────────
export async function kapAnalizCache({ db, currentUser, bildirimHash }) {
  if (!currentUser || !bildirimHash) return null;
  try {
    const ref  = doc(db, 'kapAnalizleri', bildirimHash);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (_) {
    return null;
  }
}

export async function kapAnalizKaydet({ db, currentUser, bildirimHash, bildirim, analiz }) {
  if (!currentUser || !bildirimHash) return null;
  try {
    const kayit = {
      bildirimHash,
      bildirimBaslik:  bildirim.baslik || '',
      bildirimTarih:   bildirim.tarih  || '',
      sirket:          bildirim.sirket || '',
      kodlar:          bildirim.kodlar || [],
      tip:             bildirim.tip    || '',
      yorum:           analiz.yorum    || '',
      onem:            analiz.onem     || 'normal',  // 'kritik' | 'onemli' | 'normal'
      hisseler:        analiz.hisseler || [],         // [{kod, etki: 'olumlu'|'olumsuz'|'nötr', aciklama}]
      kullaniciUid:    currentUser.uid,
      kullaniciAd:     currentUser.displayName || '',
      tarih:           Date.now(),
    };
    await setDoc(doc(db, 'kapAnalizleri', bildirimHash), kayit);
    return kayit;
  } catch (e) {
    console.error('kapAnalizKaydet hatası:', e);
    return null;
  }
}

// ─────────────────────────────────────────────
// KAP — BİLDİRİM HASH OLUŞTUR
// Bildirim index numarası + tarih → benzersiz hash
// ─────────────────────────────────────────────
export function kapHashOlustur(bildirim) {
  const str = (bildirim.index || '') + '_' + (bildirim.tarih || '') + '_' + (bildirim.sirket || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'kap_' + Math.abs(hash).toString(36);
}

// ─────────────────────────────────────────────
// CLAUDE AI — KAP BİLDİRİM ANALİZİ
//
// Tek bir KAP bildirimini AI ile analiz et.
// Takip edilen hisselerle eşleştir, etki değerlendir.
//
// @param {object} p
//   key          — Anthropic API key
//   bildirim     — normalize KAP bildirimi
//   takipEdilen  — Set<string> kullanıcının takip listesi
//   portfoy      — {kod: {adet, alisFiyati}} portföy verisi
// @returns {Promise<{yorum, onem, hisseler}|null>}
// ─────────────────────────────────────────────
export async function aiKapAnalizEt({ key, bildirim, takipEdilen = new Set(), portfoy = {} }) {
  if (!key || !bildirim) return null;

  // Takip edilen ve portföydeki hisselerin bildirimle ilişkisi
  const takipKodlar   = [...takipEdilen];
  const portfoyKodlar = Object.keys(portfoy);

  // Bildirimin direkt ilgili olduğu hisseler
  const ilgiliKodlar = bildirim.kodlar || [];

  // Portföyde olan ilgili hisseler — AI'ya özellikle belirt
  const portfoydekiIlgili = ilgiliKodlar.filter(k => portfoyKodlar.includes(k));
  const takiptekiIlgili   = ilgiliKodlar.filter(k => takipKodlar.includes(k) && !portfoydekiIlgili.includes(k));

  const portfoyBilgi = portfoydekiIlgili.length > 0
    ? 'Kullanıcının portföyündeki ilgili hisseler: ' +
      portfoydekiIlgili.map(k => k + ' (' + portfoy[k].adet + ' adet, alış: ' + portfoy[k].alisFiyati + '₺)').join(', ')
    : '';

  const prompt =
    'KAP (Kamuyu Aydınlatma Platformu) bildirimi analizi yap.\n\n' +
    'BİLDİRİM:\n' +
    'Şirket: ' + bildirim.sirket + '\n' +
    'Hisse Kodları: ' + (ilgiliKodlar.join(', ') || '—') + '\n' +
    'Tür: ' + (bildirim.tip || '—') + ' / ' + (bildirim.tipAciklama || '—') + '\n' +
    'Başlık: ' + bildirim.baslik + '\n' +
    'Özet: ' + (bildirim.ozet || 'Özet yok, başlıktan çıkar.') + '\n\n' +
    (portfoyBilgi ? portfoyBilgi + '\n\n' : '') +
    'Kullanıcının takip ettiği diğer ilgili hisseler: ' + (takiptekiIlgili.join(', ') || 'yok') + '\n\n' +
    'Lütfen şu formatta JSON ile yanıtla (başka hiçbir şey yazma):\n' +
    '{\n' +
    '  "yorum": "2-3 cümle Türkçe yorum — ne anlama geliyor, yatırımcı için önemi ne",\n' +
    '  "onem": "kritik" veya "onemli" veya "normal",\n' +
    '  "hisseler": [\n' +
    '    {"kod": "XXXX", "etki": "olumlu" veya "olumsuz" veya "nötr", "aciklama": "kısa neden"}\n' +
    '  ]\n' +
    '}\n\n' +
    'onem kriteri: "kritik" = özel durum/temettü/birleşme/halka arz gibi fiyatı doğrudan etkiler; ' +
    '"onemli" = finansal rapor/yönetim değişikliği; "normal" = rutin bildirim.\n' +
    'Sadece ilgili hisseleri hisseler dizisine ekle. Portföyde olan varsa önce ekle.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    const temiz = text.replace(/```json|```/g, '').trim();
    return JSON.parse(temiz);
  } catch (e) {
    console.error('aiKapAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return null;
  }
}

// ─────────────────────────────────────────────
// KAP — POLLING STATE
//
// Son alınan disclosureIndex'i tut.
// Her çağrıda sadece yeni bildirimleri çek.
// ─────────────────────────────────────────────
let _kapSonIndex = null;

export function kapSonIndexAl()        { return _kapSonIndex; }
export function kapSonIndexKaydet(idx) { _kapSonIndex = idx; }
// ─────────────────────────────────────────────
// CLAUDE AI — PORTFÖY ANALİZİ
// ─────────────────────────────────────────────

export async function aiPortfoyAnalizYap({ key, veriler, takipEdilen, sinyalGecmisi = [], piyasaVerisi = {} }) {
  if (!key || takipEdilen.size === 0) return '';

  const dogru      = sinyalGecmisi.filter(s => s.dogrulandi === true).length;
  const yanlis     = sinyalGecmisi.filter(s => s.dogrulandi === false).length;
  const toplam     = dogru + yanlis;
  const dogrulanmis = dogru;
  const isabet     = toplam > 0 ? Math.round(dogrulanmis / toplam * 100) : null;

  const basariliPatternler = sinyalGecmisi
    .filter(s => s.dogrulandi === true)
    .map(s => 'RSI=' + s.rsi?.toFixed(0) + ',MACD=' + s.macd?.toFixed(3) + ',Hacim=' + s.hacimFark + '%,Sinyal=' + s.sinyal)
    .slice(0, 10).join('\n');

  const basarisizPatternler = sinyalGecmisi
    .filter(s => s.dogrulandi === false)
    .map(s => 'RSI=' + s.rsi?.toFixed(0) + ',MACD=' + s.macd?.toFixed(3) + ',Hacim=' + s.hacimFark + '%,Sinyal=' + s.sinyal + ',Sonuç=' + s.sonucYuzde?.toFixed(1) + '%')
    .slice(0, 10).join('\n');

  const guncelVeri = Object.entries(veriler)
    .filter(([k]) => takipEdilen.has(k))
    .map(([k, v]) =>
      k + ': Fiyat=' + v.fiyat + '₺, RSI=' + v.rsi + ', MACD_hist=' + v.macdHist?.toFixed(3) +
      ', Hacim=' + (v.hacimFark > 0 ? '+' : '') + v.hacimFark + '%, MA20=' + v.ma20 + ', MA50=' + v.ma50 + ', Sinyal=' + v.sinyal
    ).join('\n');

  const piyasaBaglam = piyasaVerisi.xu100
    ? 'BIST100: ' + piyasaVerisi.xu100.fiyat?.toLocaleString() +
      ' (' + (piyasaVerisi.xu100.degisim >= 0 ? '+' : '') + piyasaVerisi.xu100.degisim + '%), ' +
      'USD/TRY: ' + piyasaVerisi.usdtry?.fiyat?.toFixed(2)
    : '';

  const gecmisStr = toplam > 0
    ? 'GEÇMIŞ SİNYAL PERFORMANSI:\nToplam: ' + toplam + ' sinyal | İsabet: %' + isabet + '\n' +
      'Başarılı: ' + (basariliPatternler || 'Henüz yok') + '\n' +
      'Başarısız: ' + (basarisizPatternler || 'Henüz yok')
    : 'İlk analiz — geçmiş veri henüz yok.';

  const prompt =
    'Sen tecrübeli bir BIST teknik analiz uzmanısın. Geçmiş sinyal performansına, ' +
    'piyasa koşullarına ve mevcut hisse verilerine dayanarak analiz yap.\n\n' +
    (piyasaBaglam ? 'GENEL PİYASA DURUMU:\n' + piyasaBaglam + '\n\n' : '') +
    gecmisStr + '\n\nGÜNCEL VERİLER:\n' + guncelVeri +
    '\n\nLütfen:\n1. Öne çıkan fırsatları ve riskleri belirt\n' +
    '2. Geçmiş başarısız sinyal örüntüleriyle örtüşen durumlar varsa uyar\n' +
    '3. Hacim-fiyat ilişkisini yorumla\n' +
    '4. Maksimum 5 madde, Türkçe, net ve kısa ol';

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

  const gecmis = sinyalGecmisi
    .filter(s => s.sembol === kod)
    .slice(0, 5)
    .map(s =>
      'Tarih:' + new Date(s.tarih).toLocaleDateString('tr-TR') +
      ' Sinyal:' + s.sinyal +
      ' Sonuç:' + (s.dogrulandi === true ? '✓ Doğru' : s.dogrulandi === false ? '✗ Yanlış' : 'Bekliyor') +
      (s.sonucYuzde != null ? ' (' + (s.sonucYuzde > 0 ? '+' : '') + s.sonucYuzde + '%)' : '')
    ).join('\n');

  const portfoyBilgi = portfoy[kod]
    ? 'Portföyde: ' + portfoy[kod].adet + ' adet, alış: ' + portfoy[kod].alisFiyati + '₺'
    : 'Portföyde yok';

  const ilgiliHaberler = haberlerData
    .filter(h => h.baslik?.includes(kod) || h.aciklama?.includes(kod))
    .slice(0, 2)
    .map(h => '• ' + h.baslik)
    .join('\n');

  const prompt =
    'HİSSE: ' + kod + '\n' +
    'Fiyat: ' + veri.fiyat + '₺ (' + (veri.degisim >= 0 ? '+' : '') + veri.degisim + '%)\n' +
    'RSI: ' + (veri.rsi?.toFixed(1) ?? '—') + '\n' +
    'MACD Hist: ' + (veri.macdHist?.toFixed(3) ?? '—') + '\n' +
    'MA20/MA50: ' + (veri.ma20 ?? '—') + ' / ' + (veri.ma50 ?? '—') + '\n' +
    'Bollinger %: ' + (veri.bollinger?.yuzde?.toFixed(1) ?? '—') + '\n' +
    'Hacim Farkı: ' + veri.hacimFark + '%\n' +
    'Mevcut Sinyal: ' + veri.sinyal + '\n' +
    portfoyBilgi + '\n\n' +
    (gecmis ? 'GEÇMİŞ SİNYALLER:\n' + gecmis + '\n\n' : '') +
    (ilgiliHaberler ? 'İLGİLİ HABERLER:\n' + ilgiliHaberler + '\n\n' : '') +
    'Bu hisse için kısa ve net teknik analiz yap. Risk ve fırsatları belirt. Türkçe, max 4 madde.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return { metin: text, tarih: Date.now(), sembol: kod };
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

  const takipList = [...takipEdilen].join(', ');
  const prompt =
    'Aşağıdaki finansal haberi analiz et ve takip edilen BIST hisselerini nasıl etkileyebileceğini belirt.\n\n' +
    'HABER BAŞLIĞI: ' + haber.baslik + '\n' +
    'ÖZET: ' + (haber.aciklama || '') + '\n\n' +
    'TAKİP EDİLEN HİSSELER: ' + (takipList || 'Belirtilmedi') + '\n\n' +
    'JSON formatında yanıtla:\n' +
    '{"hisseler":[{"kod":"THYAO","etki":"olumlu|olumsuz|notr","tip":"direkt|dolayli"}],"yorum":"kısa Türkçe açıklama","sure":"kısa|orta|uzun"}';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 500);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    const temiz = text.replace(/```json|```/g, '').trim();
    return JSON.parse(temiz);
  } catch (e) {
    console.error('aiHaberAnalizEt hatası:', e);
    _notify(_apiHataYonet(e));
    return null;
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — TERİM AÇIKLAMA (SÖZLÜK)
// ─────────────────────────────────────────────

export async function aiTerimAcikla({ key, terim }) {
  if (!key || !terim) return '';

  const prompt =
    'Borsa ve finans terimi olarak "' + terim + '" nedir?\n' +
    'Türkçe, sade, anlaşılır, 2-3 cümle. Teknik detaylara girmeden açıkla.';

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
// ─────────────────────────────────────────────

export async function aiGunSonuOzeti({ key, analizler }) {
  if (!key || !analizler?.length) return { text: '' };

  const ozet = analizler
    .slice(0, 20)
    .map(a =>
      a.haberBaslik + ': ' + (a.yorum || '') +
      ' | Hisseler: ' + (a.hisseler?.map(x => x.kod + '(' + x.etki + ')').join(',') || '—')
    ).join('\n');

  const prompt =
    'Bugünkü ' + analizler.length + ' haber analizine dayanarak BIST için gün sonu özeti hazırla.\n\n' +
    'ANALİZLER:\n' + ozet + '\n\n' +
    'Kısa (max 150 kelime), Türkçe, push bildirim formatında yaz.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 400);
    try { await tokenKaydet({ currentUser: null, tokens }); } catch (_) {}
    return { text };
  } catch (e) {
    console.error('aiGunSonuOzeti hatası:', e);
    _notify(_apiHataYonet(e));
    return { text: '' };
  }
}

// ─────────────────────────────────────────────
// API HATA YÖNETİMİ — kullanıcıya anlamlı mesaj
// ─────────────────────────────────────────────

function _apiHataYonet(e) {
  if (e?.message === 'API_KEY_INVALID')    return '⚠️ AI erişiminiz tanımlı değil veya geçersiz. Lütfen yöneticinizle iletişime geçin.';
  if (e?.message === 'API_QUOTA_EXCEEDED') return '⚠️ AI kullanım limitiniz doldu. Lütfen yöneticinizle iletişime geçin.';
  if (e?.message === 'API_TIMEOUT')        return '⚠️ AI yanıt vermedi (zaman aşımı). Lütfen tekrar deneyin.';
  return 'AI analizi yapılamadı: ' + (e?.message || 'Bağlantı hatası');
}

// ─────────────────────────────────────────────
// FİREBASE HATA YÖNETİMİ — kullanıcıya anlamlı mesaj
// ─────────────────────────────────────────────

export function firebaseHataYonet(e) {
  const kod = e?.code || '';
  if (kod === 'permission-denied' || kod === 'firestore/permission-denied')
    return 'Erişim reddedildi. Oturumunuzu kapatıp tekrar giriş yapın.';
  if (kod === 'unavailable' || kod === 'firestore/unavailable')
    return 'Firebase bağlantısı kesildi. İnternet bağlantınızı kontrol edin.';
  if (kod === 'deadline-exceeded' || kod === 'firestore/deadline-exceeded')
    return 'Firebase yanıt vermedi (zaman aşımı). Lütfen tekrar deneyin.';
  if (kod === 'not-found' || kod === 'firestore/not-found')
    return 'Veri bulunamadı. Sayfayı yenileyip tekrar deneyin.';
  if (kod === 'unauthenticated' || kod === 'firestore/unauthenticated')
    return 'Oturum süresi dolmuş. Lütfen tekrar giriş yapın.';
  return e?.message || 'Firebase hatası. Lütfen tekrar deneyin.';
}

// ─────────────────────────────────────────────
// FİRESTORE — TOKEN KULLANIM KAYDET
// ─────────────────────────────────────────────

export async function tokenKaydet({ currentUser, tokens }) {
  if (!tokens) return;
  // currentUser null ise global sayaçta tut
  const uid = currentUser?.uid || 'sistem';
  const email = currentUser?.email || 'sistem';
  const ad    = currentUser?.displayName || 'Sistem';
  try {
    const ay   = new Date().toISOString().slice(0, 7);
    const ref  = doc(db, 'tokenKullanim', uid + '_' + ay);
    const snap = await getDoc(ref);
    const mevcut = snap.exists() ? snap.data() : {
      uid, email, ad, ay,
      toplamToken: 0, istekSayisi: 0, maliyet: 0,
    };
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
      uid:        currentUser.uid,
      sembol:     k,
      tarih:      ts,
      gun:        bugun,
      fiyat:      v.fiyat,
      rsi:        v.rsi,
      macd:       v.macdHist,
      hacimFark:  v.hacimFark,
      ma20:       v.ma20,
      ma50:       v.ma50,
      sinyal:     v.sinyal,
      aiYorum,
      sonuc:      null,
      sonucFiyat: null,
      sonucYuzde: null,
      dogrulandi: null,
    };
    try {
      const mevcutQ = query(
        collection(db, 'sinyaller'),
        where('uid',    '==', item.uid),
        where('sembol', '==', item.sembol),
        where('gun',    '==', bugun)
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
    } catch (e) {
      console.error('sinyalKaydet hatası:', k, e);
    }
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL GEÇMİŞİ YÜKLE
// ─────────────────────────────────────────────

export async function loadSinyalGecmisi({ db, currentUser }) {
  if (!currentUser) return [];
  try {
    const q    = query(
      collection(db, 'sinyaller'),
      where('uid', '==', currentUser.uid),
      orderBy('tarih', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('loadSinyalGecmisi hatası:', e);
    _notify('Sinyal geçmişi yüklenemedi. Firebase bağlantısını kontrol edin.');
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
      await updateDoc(doc(db, 'sinyaller', sinyal.id), {
        sonuc: 'tamamlandi', sonucFiyat: v.fiyat, sonucYuzde, dogrulandi,
      });
      sinyal.sonuc       = 'tamamlandi';
      sinyal.sonucFiyat  = v.fiyat;
      sinyal.sonucYuzde  = sonucYuzde;
      sinyal.dogrulandi  = dogrulandi;
    } catch (e) {
      console.error('sinyalleriDogrula hatası:', e);
    }
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

  const gruplar = {};
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
// FİRESTORE — KULLANICI VERİSİ KAYDET
// ─────────────────────────────────────────────

export async function saveUserData({ db, currentUser, takipEdilen, portfoy, veriler }) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      takipEdilen: [...takipEdilen],
      portfoy,
      veriler,
    });
  } catch (e) {
    console.error('saveUserData hatası:', e);
    _notify('Verileriniz kaydedilemedi: ' + firebaseHataYonet(e), 'error');
    throw e; // çağıran taraf da bilsin
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — PUSH MESAJLARI
// ─────────────────────────────────────────────

export async function pushMesajGonder({ db, currentUser, baslik, mesaj }) {
  try {
    await addDoc(collection(db, 'pushMesajlar'), {
      baslik, mesaj,
      tarih:    Date.now(),
      gonderen: currentUser.uid,
      okundu:   {},
    });
  } catch (e) {
    console.error('pushMesajGonder hatası:', e);
    _notify('Push mesajı gönderilemedi: ' + (e?.message || 'Firebase hatası'));
    throw e;
  }
}

export async function checkPushMesajlar({ db, currentUser, onMesaj }) {
  if (!currentUser) return;
  try {
    const q    = query(collection(db, 'pushMesajlar'), orderBy('tarih', 'desc'), limit(5));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const m      = d.data();
      const okundu = m.okundu?.[currentUser.uid];
      if (!okundu && Date.now() - m.tarih < 24 * 60 * 60 * 1000) {
        setTimeout(() => onMesaj(m.baslik, m.mesaj), 2000);
        updateDoc(doc(db, 'pushMesajlar', d.id), {
          ['okundu.' + currentUser.uid]: true,
        });
      }
    });
  } catch (e) {
    console.error('checkPushMesajlar hatası:', e);
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
    _notify('Sözlük yüklenemedi. Lütfen sayfayı yenileyin.');
    throw e;
  }
}

export async function sozlukTerimKaydet({ db, terim, aciklama, currentUser }) {
  const yeni = {
    terim, aciklama,
    sorulma:    1,
    tarih:      Date.now(),
    kullanici:  currentUser?.displayName || currentUser?.email || 'Anonim',
  };
  const ref = await addDoc(collection(db, 'sozluk'), yeni);
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
    // 24 saatten eskiyse cache geçersiz
    if (Date.now() - d.tarih > 24 * 60 * 60 * 1000) return null;
    return d;
  } catch (e) {
    console.error('hisseAnalizCache hatası:', e);
    return null;
  }
}

export async function hisseAnalizKaydet({ db, currentUser, sembol, analiz }) {
  if (!currentUser || !sembol || !analiz) return null;
  try {
    const ref = doc(db, 'hisseAnalizleri', currentUser.uid + '_' + sembol);
    const kayit = { sembol, ...analiz, tarih: Date.now(), uid: currentUser.uid };
    await setDoc(ref, kayit);
    return kayit;
  } catch (e) {
    console.error('hisseAnalizKaydet hatası:', e);
    return null;
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
  } catch {
    return null;
  }
}

export async function haberAnalizKaydet({ db, currentUser, haberHash, analiz, haber, takipEdilen }) {
  try {
    const kayit = {
      haberHash,
      haberBaslik:  haber.baslik,
      yorum:        analiz.yorum || '',
      hisseler:     analiz.hisseler || [],
      sure:         analiz.sure || '',
      tarih:        Date.now(),
      uid:          currentUser.uid,
      kullaniciAd:  currentUser.displayName || currentUser.email,
      takipEdilen:  [...takipEdilen],
    };
    await setDoc(doc(db, 'haberAnalizleri', haberHash), kayit, { merge: true });
    return kayit;
  } catch (e) {
    console.error('haberAnalizKaydet hatası:', e);
    return null;
  }
}