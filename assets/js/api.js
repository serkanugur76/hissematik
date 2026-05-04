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
// Detay paneli veya tekil güncelleme için
// ─────────────────────────────────────────────

export async function fetchYahoo(sembol, piyasaYon = undefined) {
  try {
    const res = await fetch(
      `${PROXY}/?sembol=${sembol}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return null;
    const json = await res.json();

    // Tam parseYahooVeri yoksa hafif hesap yap
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

    // indicators.js'den parseYahooVeri — tüm göstergeler dahil
    return parseYahooVeri(sembol, json, piyasaYon);
  } catch (e) {
    console.error('fetchYahoo hatası:', sembol, e);
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO PROXY — TOPLU HİSSE
// Takip edilen hisselerin geçmiş verisi (RSI/MACD için)
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
    }
  }

  return sonuclar;
}

// ─────────────────────────────────────────────
// YAHOO PROXY — TÜM HİSSELER ANLİK FİYATLAR
// Bigpara endpoint'inden toplu kapanış fiyatı
// ─────────────────────────────────────────────

export async function fetchTumHisseFiyatlari() {
  try {
    const res = await fetch(
      `${PROXY}/?tumhisseler=1`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  } catch (e) {
    console.error('fetchTumHisseFiyatlari hatası:', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// YAHOO PROXY — PİYASA GENEL VERİSİ
// XU100, USDTRY, EURTRY
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
    return null;
  }
}

// ─────────────────────────────────────────────
// YAHOO PROXY — HABERLER
// ─────────────────────────────────────────────

export async function fetchHaberler() {
  const res = await fetch(
    `${PROXY}/?haberler=1`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error('Bağlantı hatası');
  const data = await res.json();
  return data?.haberler || [];
}

// ─────────────────────────────────────────────
// CLAUDE AI — PORTFÖY ANALİZİ
// Takip edilen tüm hisseler için genel AI yorumu
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
    .map(s => `RSI=${s.rsi?.toFixed(0)},MACD=${s.macd?.toFixed(3)},Hacim=${s.hacimFark}%,Sinyal=${s.sinyal}`)
    .slice(0, 10).join('\n');

  const basarisizPatternler = sinyalGecmisi
    .filter(s => s.dogrulandi === false)
    .map(s => `RSI=${s.rsi?.toFixed(0)},MACD=${s.macd?.toFixed(3)},Hacim=${s.hacimFark}%,Sinyal=${s.sinyal},Sonuç=${s.sonucYuzde?.toFixed(1)}%`)
    .slice(0, 10).join('\n');

  const guncelVeri = Object.entries(veriler)
    .filter(([k]) => takipEdilen.has(k))
    .map(([k, v]) =>
      `${k}: Fiyat=${v.fiyat}₺, RSI=${v.rsi}, MACD_hist=${v.macdHist?.toFixed(3)}, ` +
      `Hacim=${v.hacimFark > 0 ? '+' : ''}${v.hacimFark}%, MA20=${v.ma20}, MA50=${v.ma50}, Sinyal=${v.sinyal}`
    ).join('\n');

  const piyasaBaglam = piyasaVerisi.xu100
    ? `BIST100: ${piyasaVerisi.xu100.fiyat?.toLocaleString()} ` +
      `(${piyasaVerisi.xu100.degisim >= 0 ? '+' : ''}${piyasaVerisi.xu100.degisim}%), ` +
      `USD/TRY: ${piyasaVerisi.usdtry?.fiyat?.toFixed(2)}`
    : '';

  const gecmisStr = toplam > 0
    ? `GEÇMIŞ SİNYAL PERFORMANSI:\nToplam: ${toplam} sinyal | İsabet: %${isabet}\n` +
      `Başarılı: ${basariliPatternler || 'Henüz yok'}\n` +
      `Başarısız: ${basarisizPatternler || 'Henüz yok'}`
    : 'İlk analiz — geçmiş veri henüz yok.';

  const prompt =
    'Sen tecrübeli bir BIST teknik analiz uzmanısın. Geçmiş sinyal performansına, ' +
    'piyasa koşullarına ve mevcut hisse verilerine dayanarak analiz yap.\n\n' +
    (piyasaBaglam ? 'GENEL PİYASA DURUMU:\n' + piyasaBaglam + '\n\n' : '') +
    gecmisStr + '\n\nGÜNCEL VERİLER:\n' + guncelVeri +
    '\n\nLütfen:\n1. Öne çıkan fırsatları ve riskleri belirt\n' +
    '2. Geçmiş başarısız sinyal örüntüleriyle örtüşen durumlar varsa uyar\n' +
    '3. Hacim-fiyat ilişkisini yorumla\n' +
    '4. Her hisse için 1 cümle, sonunda genel piyasa yorumu yap\nKısa, net, Türkçe.';

  try {
    const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 1000);
    if (tokens > 0) await tokenKaydet({ db, currentUser: null, tokens });
    return text;
  } catch (e) {
    console.error('aiPortfoyAnalizYap hatası:', e);
    return '';
  }
}

// ─────────────────────────────────────────────
// CLAUDE AI — TEK HİSSE ANALİZİ
// Detay paneli için yapılandırılmış JSON karar
// ─────────────────────────────────────────────

export async function aiHisseAnalizEt({
  key, kod, veri, piyasaVerisi, sinyalGecmisi, portfoy, haberlerData, bistListesi,
}) {
  const xu = piyasaVerisi?.xu100;

  const gecmisSinyaller = sinyalGecmisi
    .filter(s => s.sembol === kod && s.dogrulandi !== null)
    .slice(0, 5)
    .map(s => `${s.sinyal}: ${s.dogrulandi ? '✓' : '✗'} (${s.sonucYuzde?.toFixed(1)}%)`)
    .join(', ');

  const sirketAdi = bistListesi?.find(b => b[0] === kod)?.[1] || '';
  const haberOzeti = (haberlerData || [])
    .filter(h => h.baslik?.includes(kod) || h.baslik?.includes(sirketAdi.split(' ')[0] || ''))
    .slice(0, 3)
    .map(h => h.baslik)
    .join(' | ');

  const pf = portfoy?.[kod];

  const prompt =
    'BIST hisse al/sat analizi. JSON don. ' +
    `Hisse:${kod} Fiyat:${veri?.fiyat || '?'}TL RSI:${veri?.rsi || '?'} ` +
    `Sinyal:${veri?.sinyal || '?'} BIST100:${xu?.degisim || 0}% ` +
    (gecmisSinyaller ? 'Gecmis:' + gecmisSinyaller : '') +
    (haberOzeti ? ' Haberler:' + haberOzeti.substring(0, 200) : '') +
    (pf ? ` Portfoy:${pf.adet}adet` : '') +
    ' Format:{"karar":"AL/ALMA/BEKLE","gerekce":"2-3 cumle",' +
    '"girisFiyati":0.0,"stopLoss":0.0,"hedefFiyat":0.0,"risk":"Dusuk/Orta/Yuksek"}';

  const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 500);
  if (tokens > 0) await tokenKaydet({ db, currentUser: null, tokens });

  try {
    const eslesen = text.match(/[{][\s\S]*[}]/);
    if (eslesen) return { ...JSON.parse(eslesen[0]), tarih: Date.now(), kod };
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
// CLAUDE AI — HABER ANALİZİ
// Tek haberin BIST hisselerine etkisi
// ─────────────────────────────────────────────

export async function aiHaberAnalizEt({ key, haber, takipEdilen }) {
  const haberMetin = (haber.baslik || '').substring(0, 300);
  const takipKodlari = [...takipEdilen].join(', ') || 'Yok';

  const prompt =
    'BIST hisse senedi haberi analiz et. Sadece JSON don. ' +
    `Haber: ${haberMetin}. Takip edilen: ${takipKodlari}. ` +
    'Format: {"hisseler":[{"kod":"THYAO","etki":"olumlu","tip":"direkt"}],' +
    '"yorum":"2 cumle turkce","sure":"Kisa/Orta/Uzun vadeli"}';

  const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 400);
  if (tokens > 0) await tokenKaydet({ db, currentUser: null, tokens });

  try {
    const eslesen = text.match(/[{][\s\S]*[}]/);
    if (eslesen) return JSON.parse(eslesen[0]);
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
// CLAUDE AI — SÖZLÜK TERİM AÇIKLAMASI
// ─────────────────────────────────────────────

export async function aiTerimAcikla({ key, terim }) {
  const prompt =
    `Borsa yatırımcısına "${terim}" terimini açıkla. ` +
    'Kısa, sade, anlaşılır Türkçe. 2-3 cümle. ' +
    'Günlük hayattan basit bir örnek ver. Teknik jargon kullanma.';

  const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 300);
  if (tokens > 0) await tokenKaydet({ db, currentUser: null, tokens });
  return text;
}

// ─────────────────────────────────────────────
// CLAUDE AI — GÜN SONU ÖZETİ
// Admin paneli için tüm haber analizlerinin özeti
// ─────────────────────────────────────────────

export async function aiGunSonuOzeti({ key, analizler }) {
  const analizOzeti = analizler
    .map(a =>
      `Haber: ${a.haberBaslik} | ` +
      `Etkilenen: ${a.hisseler?.map(x => x.kod + '(' + x.etki + ')').join(', ')} | ` +
      `Yorum: ${a.yorum}`
    ).join('\n---\n');

  const bugun = new Date().toLocaleDateString('tr-TR');
  const prompt =
    `Bugün BIST'te öne çıkan haberlerin analizleri aşağıda. ` +
    `Yatırımcılara yönelik kısa, net ve anlaşılır bir günlük piyasa özeti yaz. ` +
    `3-4 paragraf, teknik jargon kullanma, Türkçe.\n\n${analizOzeti}`;

  const { text, tokens } = await claudeIste(key, [{ role: 'user', content: prompt }], 600);
  if (tokens > 0) await tokenKaydet({ db, currentUser: null, tokens });
  return { text, tarih: bugun };
}

// ─────────────────────────────────────────────
// FİRESTORE — TOKEN KULLANIM KAYDI
// ─────────────────────────────────────────────

export async function tokenKaydet({ db, currentUser, tokens }) {
  if (!currentUser || tokens <= 0) return;
  try {
    const ay  = new Date().toISOString().slice(0, 7);
    const ref = doc(db, 'tokenKullanim', `${currentUser.uid}_${ay}`);
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
    console.error('tokenKaydet hatası:', e);
  }
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL KAYDET
// Takip edilen hisselerin günlük sinyallerini yaz,
// aynı gün aynı hisse varsa güncelle
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
  const q    = query(
    collection(db, 'sinyaller'),
    where('uid', '==', currentUser.uid),
    orderBy('tarih', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
// FİRESTORE — SİNYAL DOĞRULAMA
// DOGRULAMA_GUN gün geçmiş, sonucu henüz bilinmeyen
// sinyalleri kontrol et ve güncelle
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
    else    dogrulandi = Math.abs(sonucYuzde) < 3;  // BEKLE: ±3% tolerans

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
  const snap       = await getDocs(collection(db, 'sinyaller'));
  const tumKayitlar = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const gruplar = {};
  tumKayitlar.forEach(k => {
    const gun     = k.gun || new Date(k.tarih).toISOString().split('T')[0];
    const anahtar = `${k.uid}_${k.sembol}_${gun}`;
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
  await updateDoc(doc(db, 'users', currentUser.uid), {
    takipEdilen: [...takipEdilen],
    portfoy,
  });
}

// ─────────────────────────────────────────────
// FİRESTORE — API ANAHTARI KAYDET (Admin)
// ─────────────────────────────────────────────

export async function saveApiKey({ db, currentUser, key }) {
  await updateDoc(doc(db, 'users', currentUser.uid), { apiKey: key });
  await setDoc(doc(db, 'config', 'global'), { anthropicKey: key }, { merge: true });
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
  await addDoc(collection(db, 'pushMesajlar'), {
    baslik, mesaj,
    tarih:    Date.now(),
    gonderen: currentUser.uid,
    okundu:   {},
  });
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
          [`okundu.${currentUser.uid}`]: true,
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
  const q    = query(collection(db, 'sozluk'), orderBy('sorulma', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  await updateDoc(doc(db, 'sozluk', mevcutId), { sorulma: mevcutSorulma + 1 });
}

// ─────────────────────────────────────────────
// FİRESTORE — HİSSE ANALİZ CACHE
// ─────────────────────────────────────────────

export async function hisseAnalizCache({ db, currentUser, kod }) {
  const analizKey = `hisseAnaliz_${currentUser.uid}_${kod}`;
  const snap      = await getDoc(doc(db, 'hisseAnalizleri', analizKey));
  if (!snap.exists()) return null;
  const d = snap.data();
  // Bugünkü analiz mi?
  return Date.now() - d.tarih < 24 * 60 * 60 * 1000 ? d : null;
}

export async function hisseAnalizKaydet({ db, currentUser, kod, analiz }) {
  const analizKey = `hisseAnaliz_${currentUser.uid}_${kod}`;
  await setDoc(doc(db, 'hisseAnalizleri', analizKey), {
    ...analiz, uid: currentUser.uid, sembol: kod,
  });
}

// ─────────────────────────────────────────────
// FİRESTORE — HABER ANALİZ CACHE
// ─────────────────────────────────────────────

export function haberHashOlustur(baslik) {
  return btoa(unescape(encodeURIComponent(baslik || ''))).substring(0, 40);
}

export async function haberAnalizCache({ db, currentUser, haberHash }) {
  const docId = `${currentUser.uid}_${haberHash}`;
  const snap  = await getDoc(doc(db, 'haberAnalizleri', docId));
  return snap.exists() ? snap.data() : null;
}

export async function haberAnalizKaydet({ db, currentUser, haberHash, analiz, haber, takipEdilen }) {
  const docId = `${currentUser.uid}_${haberHash}`;
  const kayit = {
    ...analiz,
    haberBaslik: haber.baslik,
    haberLink:   haber.link || '',
    uid:          currentUser.uid,
    kullaniciAd:  currentUser.displayName || currentUser.email,
    tarih:        Date.now(),
    takipEdilen:  [...takipEdilen],
  };
  await setDoc(doc(db, 'haberAnalizleri', docId), kayit);
  return kayit;
}
