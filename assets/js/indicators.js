// ══════════════════════════════════════════════
// HisseMatik — Teknik Analiz Motoru
// assets/js/indicators.js
//
// Saf matematik — sıfır bağımlılık.
// Tüm fonksiyonlar named export ile dışarıya açılır.
// ══════════════════════════════════════════════


// ─────────────────────────────────────────────
// YARDIMCI: Ortalama
// ─────────────────────────────────────────────

export function avg(dizi) {
  return dizi.length ? dizi.reduce((x, y) => x + y, 0) / dizi.length : 0;
}


// ─────────────────────────────────────────────
// EMA — Üstel Hareketli Ortalama
// ─────────────────────────────────────────────

export function ema(kapanis, periyot) {
  if (kapanis.length < periyot) return kapanis.at(-1) || 0;
  const carpan = 2 / (periyot + 1);
  let deger = avg(kapanis.slice(0, periyot));
  for (let i = periyot; i < kapanis.length; i++) {
    deger = kapanis[i] * carpan + deger * (1 - carpan);
  }
  return deger;
}


// ─────────────────────────────────────────────
// RSI — Göreceli Güç Endeksi
// Periyot: varsayılan 14
// ─────────────────────────────────────────────

export function calcRSI(kapanis, periyot = 14) {
  if (kapanis.length < periyot + 1) return 50;
  const dilim = kapanis.slice(-periyot - 1);
  let kazanc = 0, kayip = 0;
  for (let i = 1; i < dilim.length; i++) {
    const fark = dilim[i] - dilim[i - 1];
    if (fark > 0) kazanc += fark;
    else kayip += Math.abs(fark);
  }
  const ortKazanc = kazanc / periyot;
  const ortKayip  = kayip  / periyot;
  if (ortKayip === 0) return 100;
  return 100 - (100 / (1 + ortKazanc / ortKayip));
}


// ─────────────────────────────────────────────
// MACD — Hareketli Ortalama Yakınsama/Iraksama
// EMA(12) - EMA(26), sinyal: EMA(9)
// ─────────────────────────────────────────────

export function calcMACD(kapanis) {
  const hizli     = ema(kapanis, 12);
  const yavas     = ema(kapanis, 26);
  const macdDeger = hizli - yavas;

  const seri = [];
  for (let i = 25; i < kapanis.length; i++) {
    const h = ema(kapanis.slice(0, i + 1), 12);
    const y = ema(kapanis.slice(0, i + 1), 26);
    seri.push(h - y);
  }
  const sinyal    = ema(seri, 9);
  const histogram = macdDeger - sinyal;

  return { macd: macdDeger, sinyal, histogram };
}


// ─────────────────────────────────────────────
// BOLLINGER BANTLARI
// Orta: SMA(20), Bant: ±2σ
// ─────────────────────────────────────────────

export function calcBollinger(kapanis, periyot = 20) {
  if (!kapanis || kapanis.length < periyot) {
    return { ust: 0, orta: 0, alt: 0, bw: 0, yuzde: 50 };
  }
  const dilim   = kapanis.slice(-periyot);
  const orta    = avg(dilim);
  const varyans = dilim.reduce((x, y) => x + (y - orta) ** 2, 0) / periyot;
  const std     = Math.sqrt(varyans);
  const ust     = orta + 2 * std;
  const alt     = orta - 2 * std;
  const sonFiyat = kapanis.at(-1);

  return {
    ust:   +ust.toFixed(2),
    orta:  +orta.toFixed(2),
    alt:   +alt.toFixed(2),
    bw:    +((ust - alt) / orta * 100).toFixed(2),
    yuzde: ust === alt ? 50 : +((sonFiyat - alt) / (ust - alt) * 100).toFixed(1),
  };
}


// ─────────────────────────────────────────────
// STOCHASTIC RSI
// ─────────────────────────────────────────────

export function calcStochRSI(kapanis, periyot = 14) {
  if (!kapanis || kapanis.length < periyot * 2) return { k: 50, d: 50 };

  const rsiDizisi = [];
  for (let i = periyot; i <= kapanis.length; i++) {
    const dilim = kapanis.slice(i - periyot, i);
    let kazanc = 0, kayip = 0;
    for (let j = 1; j < dilim.length; j++) {
      const fark = dilim[j] - dilim[j - 1];
      if (fark > 0) kazanc += fark;
      else kayip += Math.abs(fark);
    }
    const ortK = kazanc / periyot;
    const ortL = kayip  / periyot;
    rsiDizisi.push(ortL === 0 ? 100 : +(100 - (100 / (1 + ortK / ortL))).toFixed(2));
  }

  const son  = rsiDizisi.slice(-periyot);
  const min  = Math.min(...son);
  const maks = Math.max(...son);
  const stK  = maks === min ? 50 : +((rsiDizisi.at(-1) - min) / (maks - min) * 100).toFixed(2);
  const stD  = +avg(rsiDizisi.slice(-3)).toFixed(2);

  return { k: stK, d: stD };
}


// ─────────────────────────────────────────────
// WILLIAMS %R
// ─────────────────────────────────────────────

export function calcWilliamsR(kapanis, periyot = 14) {
  if (!kapanis || kapanis.length < periyot) return -50;
  const son     = kapanis.slice(-periyot);
  const yuksek  = Math.max(...son);
  const dusuk   = Math.min(...son);
  if (yuksek === dusuk) return -50;
  return +((yuksek - kapanis.at(-1)) / (yuksek - dusuk) * -100).toFixed(2);
}


// ─────────────────────────────────────────────
// MFI — Para Akışı Endeksi
// ─────────────────────────────────────────────

export function calcMFI(kapanis, hacim, periyot = 14) {
  if (!kapanis || kapanis.length < periyot + 1) return 50;
  let pozitif = 0, negatif = 0;
  for (let i = Math.max(1, kapanis.length - periyot); i < kapanis.length; i++) {
    const paraAkisi = kapanis[i] * (hacim[i] || 0);
    if (kapanis[i] > kapanis[i - 1]) pozitif += paraAkisi;
    else negatif += paraAkisi;
  }
  if (negatif === 0) return 100;
  return +(100 - (100 / (1 + pozitif / negatif))).toFixed(2);
}


// ─────────────────────────────────────────────
// OBV — Denge Hacmi
// ─────────────────────────────────────────────

export function calcOBV(kapanis, hacim) {
  if (!kapanis || kapanis.length < 2) return 0;
  let obv = 0;
  for (let i = 1; i < kapanis.length; i++) {
    if      (kapanis[i] > kapanis[i - 1]) obv += hacim[i] || 0;
    else if (kapanis[i] < kapanis[i - 1]) obv -= hacim[i] || 0;
  }
  return obv;
}


// ─────────────────────────────────────────────
// PIVOT NOKTALARI (Klasik)
// ─────────────────────────────────────────────

export function calcPivot(kapanis) {
  if (!kapanis || kapanis.length < 2) return {};
  const yuksek    = Math.max(...kapanis.slice(-5));
  const dusuk     = Math.min(...kapanis.slice(-5));
  const kap_son   = kapanis.at(-1);
  const pivot     = (yuksek + dusuk + kap_son) / 3;

  return {
    pivot: +pivot.toFixed(2),
    r1:    +(2 * pivot - dusuk).toFixed(2),
    r2:    +(pivot + yuksek - dusuk).toFixed(2),
    s1:    +(2 * pivot - yuksek).toFixed(2),
    s2:    +(pivot - yuksek + dusuk).toFixed(2),
  };
}


// ─────────────────────────────────────────────
// FİBONACCI GERİ ÇEKİLME SEVİYELERİ
// ─────────────────────────────────────────────

export function calcFibonacci(kapanis) {
  if (!kapanis || kapanis.length < 20) return {};
  const dilim  = kapanis.slice(-Math.min(52, kapanis.length));
  const yuksek = Math.max(...dilim);
  const dusuk  = Math.min(...dilim);
  const aralik = yuksek - dusuk;

  return {
    h:    +yuksek.toFixed(2),
    l:    +dusuk.toFixed(2),
    f236: +(yuksek - aralik * 0.236).toFixed(2),
    f382: +(yuksek - aralik * 0.382).toFixed(2),
    f500: +(yuksek - aralik * 0.500).toFixed(2),
    f618: +(yuksek - aralik * 0.618).toFixed(2),
  };
}


// ─────────────────────────────────────────────
// GELİŞMİŞ AĞIRLIKLI SKOR
// 8 gösterge üzerinden AL/SAT/BEKLE kararı
// Döner: { sinyal, guven, alYuzde, satYuzde }
// ─────────────────────────────────────────────

export function gelismisSkor(v) {
  let al = 0, sat = 0, toplam = 0;
  const ekle = (a, s, t) => { al += a; sat += s; toplam += t; };

  // RSI (15 puan)
  if      (v.rsi < 25) ekle(15, 0,  15);
  else if (v.rsi < 35) ekle(10, 0,  15);
  else if (v.rsi < 45) ekle(5,  0,  15);
  else if (v.rsi > 75) ekle(0,  15, 15);
  else if (v.rsi > 65) ekle(0,  10, 15);
  else if (v.rsi > 55) ekle(0,  5,  15);
  else                 ekle(0,  0,  15);

  // Stoch RSI (10 puan)
  if (v.stochRsi) {
    const { k, d } = v.stochRsi;
    if      (k < 20 && k > d) ekle(10, 0,  10);
    else if (k < 20)          ekle(5,  0,  10);
    else if (k > 80 && k < d) ekle(0,  10, 10);
    else if (k > 80)          ekle(0,  5,  10);
    else                      ekle(0,  0,  10);
  }

  // MACD (15 puan)
  if      (v.macdHist > 0 && v.macd > v.macdSignal) ekle(15, 0,  15);
  else if (v.macdHist > 0)                           ekle(8,  0,  15);
  else if (v.macdHist < 0 && v.macd < v.macdSignal) ekle(0,  15, 15);
  else                                               ekle(0,  8,  15);

  // Bollinger (10 puan)
  if (v.bollinger) {
    const { yuzde } = v.bollinger;
    if      (yuzde < 10) ekle(10, 0,  10);
    else if (yuzde < 25) ekle(5,  0,  10);
    else if (yuzde > 90) ekle(0,  10, 10);
    else if (yuzde > 75) ekle(0,  5,  10);
    else                 ekle(0,  0,  10);
  }

  // MA20 / MA50 trendi (15 puan)
  if (v.ma20 > v.ma50) ekle(10, 0,  15);
  else                 ekle(0,  10, 15);

  // Hacim spike + MACD yönü (10 puan)
  if      (v.hacimFark > 50 && v.macdHist > 0) ekle(10, 0, 10);
  else if (v.hacimFark > 50 && v.macdHist < 0) ekle(0,  8, 10);
  else                                          ekle(0,  0, 10);

  // Williams %R (8 puan)
  if (v.williamsR !== undefined) {
    if      (v.williamsR < -80) ekle(8, 0, 8);
    else if (v.williamsR < -60) ekle(4, 0, 8);
    else if (v.williamsR > -20) ekle(0, 8, 8);
    else if (v.williamsR > -40) ekle(0, 4, 8);
    else                        ekle(0, 0, 8);
  }

  // MFI (8 puan)
  if (v.mfi !== undefined) {
    if      (v.mfi < 20) ekle(8, 0, 8);
    else if (v.mfi < 35) ekle(4, 0, 8);
    else if (v.mfi > 80) ekle(0, 8, 8);
    else if (v.mfi > 65) ekle(0, 4, 8);
    else                 ekle(0, 0, 8);
  }

  // toplam sıfırsa güvenli varsayılan döndür
  if (toplam === 0) {
    return { sinyal: 'BEKLE', guven: 50, alYuzde: 50, satYuzde: 50 };
  }

  const alYuzde  = Math.round(al  / toplam * 100);
  const satYuzde = Math.round(sat / toplam * 100);
  const guven    = Math.max(alYuzde, satYuzde);

  let sinyal;
  if      (alYuzde  >= 65)                        sinyal = 'GÜÇLÜ AL';
  else if (alYuzde  >= 45 && alYuzde > satYuzde)  sinyal = 'AL';
  else if (satYuzde >= 65)                        sinyal = 'GÜÇLÜ SAT';
  else if (satYuzde >= 45 && satYuzde > alYuzde)  sinyal = 'SAT';
  else                                            sinyal = 'BEKLE';

  return { sinyal, guven, alYuzde, satYuzde };
}


// ─────────────────────────────────────────────
// GENEL SİNYAL (Hafif versiyon)
// ─────────────────────────────────────────────

export function genelSinyal(rsi, macd, ma20, ma50, hacimFark) {
  let al = 0, sat = 0;

  if      (rsi < 25) al  += 3;
  else if (rsi < 35) al  += 2;
  else if (rsi < 45) al  += 1;
  else if (rsi > 80) sat += 3;
  else if (rsi > 70) sat += 2;
  else if (rsi > 60) sat += 1;

  if      (macd.histogram > 0 && macd.macd > macd.sinyal) al  += 2;
  else if (macd.histogram < 0)                             sat += 2;

  if (ma20 > ma50) al  += 1;
  else             sat += 1;

  if (hacimFark > 50)                al  += 1;
  if (hacimFark > 100 && rsi > 65)   sat += 1;

  if (al  >= 5)              return 'GÜÇLÜ AL';
  if (al  >= 3 && al > sat)  return 'AL';
  if (sat >= 5)              return 'GÜÇLÜ SAT';
  if (sat >= 3 && sat > al)  return 'SAT';
  return 'BEKLE';
}


// ─────────────────────────────────────────────
// SİNYAL CSS SINIFI
// ─────────────────────────────────────────────

export function sinyalClass(sinyal) {
  const harita = {
    'GÜÇLÜ AL':  'guclu-al',
    'AL':        'al',
    'SAT':       'sat',
    'GÜÇLÜ SAT': 'guclu-sat',
    'BEKLE':     'bekle',
  };
  return harita[sinyal] || 'bekle';
}

// ─────────────────────────────────────────────
// HANGİ GÖSTERGELER TETİKLENDİ (İnsan okunur)
// ─────────────────────────────────────────────
export function gostergelerListele(v) {
  const liste = [];
  if (!v) return liste;

  // RSI
  if      (v.rsi < 25) liste.push({ etiket: 'RSI kritik satım', yon: 'al', deger: v.rsi?.toFixed(1) });
  else if (v.rsi < 35) liste.push({ etiket: 'RSI aşırı satım',  yon: 'al', deger: v.rsi?.toFixed(1) });
  else if (v.rsi > 75) liste.push({ etiket: 'RSI kritik alım',  yon: 'sat', deger: v.rsi?.toFixed(1) });
  else if (v.rsi > 65) liste.push({ etiket: 'RSI aşırı alım',   yon: 'sat', deger: v.rsi?.toFixed(1) });

  // StochRSI
  if (v.stochRsi) {
    const { k, d } = v.stochRsi;
    if      (k < 20 && k > d) liste.push({ etiket: 'StochRSI dip dönüşü',   yon: 'al',  deger: k?.toFixed(0) });
    else if (k < 20)          liste.push({ etiket: 'StochRSI aşırı satım',  yon: 'al',  deger: k?.toFixed(0) });
    else if (k > 80 && k < d) liste.push({ etiket: 'StochRSI zirve dönüşü', yon: 'sat', deger: k?.toFixed(0) });
    else if (k > 80)          liste.push({ etiket: 'StochRSI aşırı alım',   yon: 'sat', deger: k?.toFixed(0) });
  }

  // MACD
  if      (v.macdHist > 0 && v.macd > v.macdSignal) liste.push({ etiket: 'MACD yukarı kesişim', yon: 'al',  deger: v.macdHist?.toFixed(3) });
  else if (v.macdHist > 0)                           liste.push({ etiket: 'MACD pozitif',         yon: 'al',  deger: v.macdHist?.toFixed(3) });
  else if (v.macdHist < 0 && v.macd < v.macdSignal) liste.push({ etiket: 'MACD aşağı kesişim',  yon: 'sat', deger: v.macdHist?.toFixed(3) });
  else if (v.macdHist < 0)                           liste.push({ etiket: 'MACD negatif',         yon: 'sat', deger: v.macdHist?.toFixed(3) });

  // Bollinger
  if (v.bollinger) {
    if      (v.bollinger.yuzde < 10) liste.push({ etiket: 'Bollinger alt band',   yon: 'al',  deger: v.bollinger.yuzde + '%' });
    else if (v.bollinger.yuzde < 25) liste.push({ etiket: 'Bollinger alt bölge',  yon: 'al',  deger: v.bollinger.yuzde + '%' });
    else if (v.bollinger.yuzde > 90) liste.push({ etiket: 'Bollinger üst band',   yon: 'sat', deger: v.bollinger.yuzde + '%' });
    else if (v.bollinger.yuzde > 75) liste.push({ etiket: 'Bollinger üst bölge',  yon: 'sat', deger: v.bollinger.yuzde + '%' });
  }

  // MA Trend
  if      (v.ma20 > v.ma50 * 1.005) liste.push({ etiket: 'MA20 > MA50 (trend yukarı)', yon: 'al',  deger: null });
  else if (v.ma20 < v.ma50 * 0.995) liste.push({ etiket: 'MA20 < MA50 (trend aşağı)',  yon: 'sat', deger: null });

  // Hacim
  if      (v.hacimFark > 80 && v.macdHist > 0) liste.push({ etiket: 'Güçlü hacim patlaması',   yon: 'al',  deger: '+' + v.hacimFark + '%' });
  else if (v.hacimFark > 50 && v.macdHist > 0) liste.push({ etiket: 'Hacim artışı',            yon: 'al',  deger: '+' + v.hacimFark + '%' });
  else if (v.hacimFark > 50 && v.macdHist < 0) liste.push({ etiket: 'Satış hacim artışı',      yon: 'sat', deger: '+' + v.hacimFark + '%' });

  // Williams %R
  if      (v.williamsR !== undefined && v.williamsR < -80) liste.push({ etiket: 'Williams %R satım', yon: 'al',  deger: v.williamsR?.toFixed(0) });
  else if (v.williamsR !== undefined && v.williamsR > -20) liste.push({ etiket: 'Williams %R alım',  yon: 'sat', deger: v.williamsR?.toFixed(0) });

  // MFI
  if      (v.mfi !== undefined && v.mfi < 20) liste.push({ etiket: 'MFI aşırı satım', yon: 'al',  deger: v.mfi?.toFixed(0) });
  else if (v.mfi !== undefined && v.mfi > 80) liste.push({ etiket: 'MFI aşırı alım',  yon: 'sat', deger: v.mfi?.toFixed(0) });

  return liste;
}


// ─────────────────────────────────────────────
// YAHOO VERİSİNİ PARSE ET
// ─────────────────────────────────────────────

/**
 * @param {object} result  — json.chart.result[0] (api.js tarafından çözülmüş)
 * @param {number} [piyasaYon] — BIST100 günlük % değişimi, sinyal filtrelemesi için
 */
export function parseYahooVeri(result, piyasaYon = undefined) {
  try {
    if (!result) return null;

    const meta     = result.meta;
    const quote    = result.indicators?.quote?.[0] || {};

    // null değerleri filtrele — Yahoo zaman zaman null dizi elemanı gönderir
    const kapanis  = (quote.close  || []).filter(x => x != null && x > 0);
    const hacimler = (quote.volume || []).filter(x => x != null && x >= 0);

    // Yetersiz veri — en az 5 kapanış gerekli
    if (kapanis.length < 5) return null;

    // Fiyat & değişim
    const fiyat   = meta.regularMarketPrice || kapanis.at(-1);
    const onceki  = meta.chartPreviousClose  || kapanis.at(-2) || fiyat;
    const degisim = onceki > 0 ? +((fiyat - onceki) / onceki * 100).toFixed(2) : 0;

    // Hacim
    const hacimOrt  = avg(hacimler.slice(-20));
    const hacimSon  = hacimler.at(-1) || 0;
    const hacimFark = hacimOrt > 0 ? +((hacimSon / hacimOrt - 1) * 100).toFixed(0) : 0;

    // Temel göstergeler
    const rsiVal  = calcRSI(kapanis, 14);
    const macdVal = calcMACD(kapanis);
    const ma9     = +avg(kapanis.slice(-9)).toFixed(2);
    const ma20    = +avg(kapanis.slice(-20)).toFixed(2);
    const ma50    = +(kapanis.length >= 50  ? avg(kapanis.slice(-50))  : avg(kapanis)).toFixed(2);
    const ma200   = +(kapanis.length >= 200 ? avg(kapanis.slice(-200)) : avg(kapanis)).toFixed(2);

    // Gelişmiş göstergeler
    const bollinger = calcBollinger(kapanis);
    const stochRsi  = calcStochRSI(kapanis);
    const williamsR = calcWilliamsR(kapanis);
    const mfi       = calcMFI(kapanis, hacimler);
    const obv       = calcOBV(kapanis, hacimler);
    const pivot     = calcPivot(kapanis);
    const fib       = calcFibonacci(kapanis);

    // 52 haftalık yüksek / düşük
    const son52h       = kapanis.slice(-252);
    const hafta52H     = +Math.max(...son52h).toFixed(2);
    const hafta52L     = +Math.min(...son52h).toFixed(2);
    const hafta52Yuzde = hafta52H > hafta52L
      ? +((fiyat - hafta52L) / (hafta52H - hafta52L) * 100).toFixed(1)
      : 50;

    // Ağırlıklı skor — ASCII değişken adı, Türkçe karakter yok
    const skorGirdisi = {
      rsi:        rsiVal,
      stochRsi,
      macd:       macdVal.macd,
      macdSignal: macdVal.sinyal,
      macdHist:   macdVal.histogram,
      bollinger,
      ma20, ma50,
      hacimFark,
      williamsR,
      mfi,
    };
    const skorSonuc = gelismisSkor(skorGirdisi); // Türkçe ö kaldırıldı

    // Piyasa yönüne göre sinyal filtresi
    const hamSinyal = sinyalPiyasaFiltrele(skorSonuc.sinyal, degisim, piyasaYon);

    // guven alanını Number ile zorunlu çevir — NaN'ı yakala
    const guvenSkoru = Number.isFinite(skorSonuc.guven) ? skorSonuc.guven : 50;

    return {
      fiyat:       +fiyat.toFixed(2),
      degisim,
      rsi:         +rsiVal.toFixed(1),
      stochRsi,
      macd:        +macdVal.macd.toFixed(4),
      macdSignal:  +macdVal.sinyal.toFixed(4),
      macdHist:    +macdVal.histogram.toFixed(4),
      ma9, ma20, ma50, ma200,
      bollinger, williamsR, mfi, obv,
      pivot, fib,
      hafta52H, hafta52L, hafta52Yuzde,
      hacim:       hacimSon,
      hacimFark,
      guvenSkoru,                    // her zaman sayı, asla NaN veya undefined
      alYuzde:     skorSonuc.alYuzde,
      satYuzde:    skorSonuc.satYuzde,
      sinyal:      hamSinyal,
      kapanis:     kapanis.slice(-60),
      ts:          Date.now(),
    };
  } catch (e) {
    console.error('parseYahooVeri hatası:', result?.meta?.symbol || '?', e);
    return null;
  }
}


// ─────────────────────────────────────────────
// PİYASA YÖN FİLTRESİ
// ─────────────────────────────────────────────

export function sinyalPiyasaFiltrele(sinyal, _hisseDegisim, piyasaYon) {
  if (piyasaYon === undefined || piyasaYon === null) return sinyal;

  if (piyasaYon < -2 && sinyal === 'AL')        return 'BEKLE';
  if (piyasaYon < -3 && sinyal === 'GÜÇLÜ AL')  return 'AL';
  if (piyasaYon >  2 && sinyal === 'SAT')        return 'BEKLE';
  if (piyasaYon >  3 && sinyal === 'GÜÇLÜ SAT') return 'SAT';

  return sinyal;
}