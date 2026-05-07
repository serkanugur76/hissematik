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
// #6 — TOAST CALLBACK
// api.js DOM'a dokunamaz; ui.js'deki showToast'u
// app.js'in başlatma sırasında buraya bağlar.
// Kullanım (app.js'de):  setApiToast(showToast);
// ─────────────────────────────────────────────

let _toast = null;

/** app.js tarafından bir kez çağrılır */
export function setApiToast(fn) { _toast = fn; }

/** api.js içinde kullanılacak yardımcı — DOM'a dokunmaz */
function _notify(mesaj, tip = 'error') {
  if (_toast) _toast(mesaj, tip);
  else        console.error('[api]', mesaj);
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

/** Claude'a istek at — ham metin döner */
async function claudeIste(key, mesajlar, maxToken = 1000) {
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': temizleKey(key),
      'anthropic-version': CLAUDE_VER,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxToken,
      messages: mesajlar,
    }),
  });
  const data = await res.json();
  return {
    text:   data?.content?.[0]?.text || '',
    tokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0),
  };
}

// ─────────────────────────────────────────────
// YAHOO PROXY — TEK HİSSE
// ─────────────────────────────────────────────

export async function fetchYahoo(sembol, piyasaYon = undefined) {
  try {
    const res = await fetch(
      `${PROXY}/?sembol=${sembol}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return null;
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta     = result.meta;
    const kapanis  = (result.indicators?.quote?.[0]?.close  || []).filter(x => x > 0);
    const hacimler = (result.indicators?.quote?.[0]?.volume || []).filter(x => x > 0);
    if (kapanis.length < 20) return null;

    const fiyat     = meta.regularMarketPrice || kapanis.at(-1);
    const onceki    = meta.chartPreviousClose  || kapanis.at(-2);
    const degisim   = onceki > 0 ? +((fiyat - onceki) / onceki * 100).toFixed(2) : 0;
    const hacimOrt  = avg(hacimler.slice(-20));
    const hacimSon  = hacimler.at(-1) || 0;
    const hacimFark = hacimOrt > 0 ? +((hacimSon / hacimOrt - 1) * 100).toFixed(0) : 0;

    return parseYahooVeri(sembol, json, piyasaYon);
  } catch (e) {
    console.error('fetchYahoo hatası:', sembol, e);
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO PROXY — TOPLU HİSSE
// ─────────────────────────────────────────────

export async function fetchTopluYahoo(semboller, piyasaYon = undefined) {
  const sonuclar = {};
  const grupBoyutu = 100;

  for (let i = 0; i < semboller.length; i += grupBoyutu) {
    const grup = semboller.slice(i, i + grupBoyutu);
    try {
      const res = await fetch(
        `${PROXY}/?semboller=${grup.join(',')}`,
        { signal: AbortSignal.timeout(30000) }
      );
      if (!res.ok) continue;
      const topluVeri = await res.json();

      for (const [sembol, json] of Object.entries(topluVeri)) {
        const v = parseYahooVeri(sembol, json, piyasaYon);
        if (v) sonuclar[sembol] = v;
      }
    } catch (e) {
      console.error('fetchTopluYahoo grup hatası:', e);
      // Kullanıcıya sessiz hata — toplu işlem devam etmeli, toast atmıyoruz
    }
  }

  return sonuclar;
}

// ─────────────────────────────────────────────
// YAHOO PROXY — TÜM HİSSELER ANLİK FİYATLAR
// ─────────────────────────────────────────────

export async function fetchTumHisseFiyatlari() {
  try {
    const { BIST } = await import('./state.js');
    const tumKodlar = BIST.map(([k]) => k);
    const grupBoyutu = 20;
    const sonuclar = [];

    for (let i = 0; i < tumKodlar.length; i += grupBoyutu) {
      const grup = tumKodlar.slice(i, i + grupBoyutu);
      try {
        const res = await fetch(
          `${PROXY}/?semboller=${grup.join(',')}`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!res.ok) continue;
        const topluVeri = await res.json();

        for (const [sembol, json] of Object.entries(topluVeri)) {
          const meta = json?.chart?.result?.[0]?.meta;
          if (!meta) continue;
          sonuclar.push({
            KOD:     sembol.replace('.IS', ''),
            KAPANIS: meta.regularMarketPrice || 0,
            YUZDE:   meta.chartPreviousClose > 0
              ? +((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2)
              : 0,
            HACIM:   meta.regularMarketVolume || 0,
          });
        }
      } catch (_) {}
    }

    return sonuclar;
  } catch (e) {
    console.error('fetchTumHisseFiyatlari hatası:', e);
    _notify('Yahoo Finance bağlantısı kurulamadı. Veriler güncellenemedi.');
    return [];
  }
}
// ─────────────────────────────────────────────
// YAHOO PROXY — PİYASA GENEL VERİSİ
// ─────────────────────────────────────────────

export async function fetchPiyasaVerisi() {
  try {
    const res = await fetch(
      `${PROXY}/?piyasa=1`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('fetchPiyasaVerisi hatası:', e);
    // Sessiz — piyasa kartları boş kalır, kritik değil
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO PROXY — HABERLER
// #8 — try/catch eklendi; hata fırlatmak yerine
//      _notify ile kullanıcıya mesaj gösterilir
//      ve boş dizi döner (app.js crash yapmaz).
// ─────────────────────────────────────────────

export async function fetchHaberler() {
  try {
    const res = await fetch(
      `${PROXY}/?haberler=1`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) {
      _notify('Haber servisi yanıt vermedi (' + res.status + '). Lütfen tekrar deneyin.');
      return [];
    }
    const data = await res.json();
    return data?.haberler || [];
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      _notify('Haber servisi zaman aşımına uğradı. İnternet bağlantınızı kontrol edin.');
    } else {
      _notify('Haberler yüklenirken hata oluştu: ' + (e?.message || 'Bilinmeyen hata'));
    }
    console.error('fetchHaberler hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — PORTFÖY ANALİZİ
// ─────────────────────────────────────────────

export async function aiPortfoyAnalizYap({
  key, veriler, takipEdilen, sinyalGecmisi, piyasaVerisi,
}) {
  if (!key || takipEdilen.size === 0) return '';

  const dogrulanmis = sinyalGecmisi.filter(s => s.dogrulandi === true).length;
  const yanlis      = sinyalGecmisi.filter(s => s.dogrulandi === false).length;
  const toplam      = dogrulanmis + yanlis;
  const isabet      = toplam > 0 ? Math.round(dogrulanmis / toplam * 100) : null;

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
    try { await tokenKaydet({ currentUser: { uid: 'havuz', email: 'havuz', displayName: 'Havuz' }, tokens }); } catch (_) {}
    return text;
  } catch (e) {
    console.error('aiPortfoyAnalizYap hatası:', e);
    _notify('AI analizi yapılamadı: ' + (e?.message || 'Bağlantı hatası'));
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
    .map(s => 'Tarih:' + new Date(s.tarih).toLocaleDateString('tr-TR') + ' Sinyal:' + s.sinyal + ' Sonuç:' + (s.dogrulandi === true ? '✓' : s.dogrulandi === false ? '✗' : '?') + (s.sonucYuzde ? ' %' + s.sonucYuzde : ''))
    .join('\n');

  const piyasaBaglam = piyasaVerisi.xu100
    ? 'Piyasa: BIST100 ' + (piyasaVerisi.xu100.degisim >= 0 ? '+' : '') + piyasaVerisi.xu100.degisim + '%, USD/TRY: ' + (piyasaVerisi.usdtry?.fiyat?.toFixed(2) || '—') + '\n'
    : '';

  const pfBilgi = portfoy[kod]
    ? 'Portföyde: ' + portfoy[kod].adet + ' adet, alış fiyatı: ' + portfoy[kod].alisFiyati + '₺\n'
    : '';

  const ilgiliHaberler = haberlerData
    .filter(h => h.baslik && h.baslik.includes(kod))
    .slice(0, 2)
    .map(h => '- ' + h.baslik)
    .join('\n');
  const haberBaglam = ilgiliHaberler ? 'İlgili haberler:\n' + ilgiliHaberler + '\n' : '';

  const prompt =
    'BIST hisse analizi — ' + kod + '\n\n' +
    piyasaBaglam + pfBilgi + haberBaglam +
    'Fiyat: ' + veri.fiyat + '₺ | Değişim: ' + veri.degisim + '%\n' +
    'RSI: ' + veri.rsi + ' | MACD Hist: ' + veri.macdHist?.toFixed(3) + '\n' +
    'MA20: ' + veri.ma20 + ' | MA50: ' + veri.ma50 + '\n' +
    'Bollinger %B: ' + (veri.bollinger?.yuzde ?? '—') + '\n' +
    'Hacim Farkı: ' + veri.hacimFark + '%\n' +
    'Mevcut Sinyal: ' + veri.sinyal + '\n\n' +
    (gecmis ? 'GEÇMİŞ SİNYALLER:\n' + gecmis + '\n\n' : '') +
    'Bu hisse için kısa ve net teknik analiz yap. Risk ve fırsatları belirt. Türkçe, max 4 madde.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 900);
    try { await tokenKaydet({ currentUser: { uid: 'havuz', email: 'havuz', displayName: 'Havuz' }, tokens }); } catch (_) {}
    try {
      const temiz  = text.replace(/```json|```/g, '').trim();
      const ilkSus = temiz.indexOf('{');
      const parsed = JSON.parse(ilkSus >= 0 ? temiz.slice(ilkSus) : temiz);
      return { ...parsed, tarih: Date.now(), sembol: kod };
    } catch (_) {
      return { metin: text, tarih: Date.now(), sembol: kod };
    }
  } catch (e) {
    console.error('aiHisseAnalizEt hatası:', e);
    _notify(kod + ' analizi yapılamadı: ' + (e?.message || 'Bağlantı hatası'));
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
    try { await tokenKaydet({ currentUser: { uid: 'havuz', email: 'havuz', displayName: 'Havuz' }, tokens }); } catch (_) {}
    const temiz = text.replace(/```json|```/g, '').trim();
    return JSON.parse(temiz);
  } catch (e) {
    console.error('aiHaberAnalizEt hatası:', e);
    _notify('Haber analizi yapılamadı: ' + (e?.message || 'Bağlantı hatası'));
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
    try { await tokenKaydet({ currentUser: { uid: 'havuz', email: 'havuz', displayName: 'Havuz' }, tokens }); } catch (_) {}
    return text;
  } catch (e) {
    console.error('aiTerimAcikla hatası:', e);
    _notify('"' + terim + '" açıklaması alınamadı: ' + (e?.message || 'Bağlantı hatası'));
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
    .map(a => a.haberBaslik + ': ' + (a.yorum || '') + ' | Hisseler: ' + (a.hisseler?.map(x => x.kod + '(' + x.etki + ')').join(',') || '—'))
    .join('\n');

  const prompt =
    'Bugünkü ' + analizler.length + ' haber analizine dayanarak BIST için gün sonu özeti hazırla.\n\n' +
    'ANALİZLER:\n' + ozet + '\n\n' +
    'Kısa (max 150 kelime), Türkçe, push bildirim formatında yaz.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 400);
    try { await tokenKaydet({ currentUser: { uid: 'havuz', email: 'havuz', displayName: 'Havuz' }, tokens }); } catch (_) {}
    return { text };
  } catch (e) {
    console.error('aiGunSonuOzeti hatası:', e);
    _notify('Gün sonu özeti oluşturulamadı: ' + (e?.message || 'Bağlantı hatası'));
    return { text: '' };
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — TOKEN KULLANIM KAYDET
// ─────────────────────────────────────────────

export async function tokenKaydet({ currentUser, tokens }) {
  if (!tokens || !currentUser) return;
  try {
    const ay  = new Date().toISOString().slice(0, 7);
    const ref = doc(db, 'tokenKullanim', currentUser.uid + '_' + ay);
    const snap = await getDoc(ref);
    const mevcut = snap.exists() ? snap.data() : {
      uid:         currentUser.uid,
      email:       currentUser.email,
      ad:          currentUser.displayName || '',
      ay,
      toplamToken: 0,
      istekSayisi: 0,
      maliyet:     0,
    };
    const yeniToken = mevcut.toplamToken + tokens;
    await setDoc(ref, {
      ...mevcut,
      toplamToken:   yeniToken,
      istekSayisi:   mevcut.istekSayisi + 1,
      maliyet:       +(yeniToken * TOKEN_MALIYET).toFixed(4),
      sonGuncelleme: Date.now(),
    });
  } catch (e) {

  }
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
      // #6 — Sessiz: kayıt başarısız olsa da akış devam etmeli
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

    if      (['AL', 'GÜÇLÜ AL'].includes(sinyal.sinyal))  dogrulandi = sonucYuzde > 0;
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
  
  // Boş takip listesi varsa yazma — veri kaybı önleme
  const takipDizi = [...takipEdilen];
  if (takipDizi.length === 0 && Object.keys(portfoy).length === 0) {
    console.warn('saveUserData: Boş veri, yazılmadı.');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      takipEdilen: takipDizi,
      portfoy,
      veriler,
    });
  } catch (e) {
    console.error('saveUserData hatası:', e);
    _notify('Verileriniz kaydedilemedi. İnternet bağlantınızı kontrol edin.', 'error');
  }
}
// ─────────────────────────────────────────────
// FİRESTORE — API ANAHTARI KAYDET (Admin)
// ─────────────────────────────────────────────

export async function saveApiKey({ db, currentUser, key }) {
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { apiKey: key });
    await setDoc(doc(db, 'config', 'global'), { anthropicKey: key }, { merge: true });
  } catch (e) {
    console.error('saveApiKey hatası:', e);
    _notify('API anahtarı kaydedilemedi: ' + (e?.message || 'Firebase hatası'));
    throw e; // app.js'e fırlat — showToast zaten orada da var
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — HAVUZ API KEY YÜKLE
// ─────────────────────────────────────────────

export async function loadHavuzKey({ db }) {
  try {
    const snap = await getDoc(doc(db, 'config', 'global'));
    return snap.exists() ? (snap.data().anthropicKey || '') : '';
  } catch (e) {
    console.error('loadHavuzKey hatası:', e);
    return '';
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
    return [];
  }
}

export async function sozlukTerimKaydet({ db, terim, aciklama, currentUser }) {
  const yeni = {
    terim, aciklama,
    sorulma:       1,
    tarih:         Date.now(),
    ekleyenUid:    currentUser.uid,
    ekleyenAd:     currentUser.displayName || currentUser.email,
    pushGonderildi: false,
  };
  const ref = await addDoc(collection(db, 'sozluk'), yeni);
  return { id: ref.id, ...yeni };
}

export async function sozlukSorulmaSayisiArtir({ db, mevcutId, mevcutSorulma }) {
  try {
    await updateDoc(doc(db, 'sozluk', mevcutId), { sorulma: mevcutSorulma + 1 });
  } catch (e) {
    console.error('sozlukSorulmaSayisiArtir hatası:', e);
    // Sessiz — sayaç artışı kritik değil
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — HİSSE ANALİZ CACHE
// ─────────────────────────────────────────────

export async function hisseAnalizCache({ db, currentUser, kod }) {
  const analizKey = 'hisseAnaliz_' + currentUser.uid + '_' + kod;
  const snap      = await getDoc(doc(db, 'hisseAnalizleri', analizKey));
  if (!snap.exists()) return null;
  const d = snap.data();
  return Date.now() - d.tarih < 24 * 60 * 60 * 1000 ? d : null;
}

export async function hisseAnalizKaydet({ db, currentUser, kod, analiz }) {
  const analizKey = 'hisseAnaliz_' + currentUser.uid + '_' + kod;
  try {
    await setDoc(doc(db, 'hisseAnalizleri', analizKey), {
      ...analiz, uid: currentUser.uid, sembol: kod,
    });
  } catch (e) {
    console.error('hisseAnalizKaydet hatası:', e);
    // Sessiz — cache yazma hatası kullanıcıyı bloke etmemeli
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — HABER ANALİZ CACHE
// ─────────────────────────────────────────────

export function haberHashOlustur(baslik) {
  return btoa(unescape(encodeURIComponent(baslik || ''))).substring(0, 40);
}

export async function haberAnalizCache({ db, currentUser, haberHash }) {
  const docId = currentUser.uid + '_' + haberHash;
  const snap  = await getDoc(doc(db, 'haberAnalizleri', docId));
  return snap.exists() ? snap.data() : null;
}

export async function haberAnalizKaydet({ db, currentUser, haberHash, analiz, haber, takipEdilen }) {
  const docId = currentUser.uid + '_' + haberHash;
  const kayit = {
    ...analiz,
    haberBaslik: haber.baslik,
    haberLink:   haber.link || '',
    uid:          currentUser.uid,
    kullaniciAd:  currentUser.displayName || currentUser.email,
    tarih:        Date.now(),
    takipEdilen:  [...takipEdilen],
  };
  try {
    await setDoc(doc(db, 'haberAnalizleri', docId), kayit);
  } catch (e) {
    console.error('haberAnalizKaydet hatası:', e);
    // Sessiz — cache yazma kritik değil
  }
  return kayit;
}