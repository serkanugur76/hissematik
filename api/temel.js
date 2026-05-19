// Vercel Serverless Function — Temel Analiz Verileri
// GET /api/temel?sembol=THYAO
//
// Yahoo Finance quoteSummary üzerinden F/K, PD/DD, piyasa değeri,
// temettü verimi, ROE, borç oranı gibi temel verileri döner.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

async function getCrumb() {
  // 1. Önce consent cookie'yi al
  const consentRes = await fetch(
    'https://consent.yahoo.com/v2/collectConsent?sessionId=1_cc-session_placeholder',
    { headers: HEADERS, signal: AbortSignal.timeout(5000) }
  ).catch(() => null);

  // 2. Ana sayfadan cookie al
  const homeRes = await fetch('https://finance.yahoo.com', {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  const cookie = homeRes.headers.get('set-cookie') || '';

  // 3. Crumb al
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...HEADERS, 'Cookie': cookie },
    signal: AbortSignal.timeout(5000),
  });
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes('{')) throw new Error('Crumb alınamadı');
  return { crumb: crumb.trim(), cookie };
}

function sayi(obj, alan) {
  const v = obj?.[alan];
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v.raw ?? null;
  return typeof v === 'number' ? v : null;
}

function fmt(n, ondalik = 2) {
  if (n === null || n === undefined || isNaN(n)) return null;
  return +n.toFixed(ondalik);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sembol } = req.query;
  if (!sembol) return res.status(400).json({ hata: 'sembol parametresi gerekli' });

  const ticker = sembol.toUpperCase().replace('.IS', '') + '.IS';

  try {
    // Crumb + cookie al
    const { crumb, cookie } = await getCrumb();

    // quoteSummary çek
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile` +
      `&crumb=${encodeURIComponent(crumb)}&formatted=false&lang=tr-TR&region=TR`;

    const dataRes = await fetch(url, {
      headers: { ...HEADERS, 'Cookie': cookie },
      signal: AbortSignal.timeout(8000),
    });
    const json = await dataRes.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) {
      const err = json?.quoteSummary?.error;
      return res.status(404).json({ hata: err?.description || 'Veri bulunamadı' });
    }

    const sd  = result.summaryDetail       || {};
    const ks  = result.defaultKeyStatistics || {};
    const fd  = result.financialData        || {};
    const ap  = result.assetProfile         || {};

    const veri = {
      // Değerleme
      fk:             fmt(sayi(sd,  'trailingPE')),
      ileriFK:        fmt(sayi(sd,  'forwardPE')),
      pddd:           fmt(sayi(ks,  'priceToBook')),
      fiyatSatis:     fmt(sayi(ks,  'priceToSalesTrailingTwelveMonths')),
      evEbitda:       fmt(sayi(ks,  'enterpriseToEbitda')),
      piyasaDegeri:   fmt(sayi(sd,  'marketCap')),

      // Kârlılık
      eps:            fmt(sayi(ks,  'trailingEps')),
      roe:            fmt(sayi(fd,  'returnOnEquity') != null ? sayi(fd, 'returnOnEquity') * 100 : null),
      roa:            fmt(sayi(fd,  'returnOnAssets') != null ? sayi(fd, 'returnOnAssets') * 100 : null),
      netKarMarji:    fmt(sayi(fd,  'profitMargins') != null ? sayi(fd, 'profitMargins') * 100 : null),
      brutMarj:       fmt(sayi(fd,  'grossMargins')  != null ? sayi(fd, 'grossMargins')  * 100 : null),

      // Temettü
      temettuVerimi:  fmt(sayi(sd,  'dividendYield') != null ? sayi(sd, 'dividendYield') * 100 : null),
      temettuOrani:   fmt(sayi(sd,  'payoutRatio')   != null ? sayi(sd, 'payoutRatio')   * 100 : null),

      // Borç & Büyüme
      borcOzkaynak:   fmt(sayi(fd,  'debtToEquity')),
      gunlukNakit:    fmt(sayi(fd,  'totalCashPerShare')),
      gelirBuyume:    fmt(sayi(fd,  'revenueGrowth')  != null ? sayi(fd, 'revenueGrowth')  * 100 : null),
      karBuyume:      fmt(sayi(fd,  'earningsGrowth') != null ? sayi(fd, 'earningsGrowth') * 100 : null),

      // Genel
      beta:           fmt(sayi(sd,  'beta')),
      sektor:         ap.sector   || null,
      sektorTR:       _sektorCevir(ap.sector),
      sirketAdi:      ap.longName || null,
    };

    return res.status(200).json({ sembol: sembol.toUpperCase(), veri });
  } catch (e) {
    console.error('temel API hatası:', ticker, e?.message);
    return res.status(500).json({ hata: e?.message || 'Sunucu hatası' });
  }
}

function _sektorCevir(s) {
  const harita = {
    'Financial Services': 'Finansal Hizmetler',
    'Industrials': 'Sanayi',
    'Consumer Cyclical': 'Tüketim (Döngüsel)',
    'Consumer Defensive': 'Tüketim (Savunmacı)',
    'Energy': 'Enerji',
    'Technology': 'Teknoloji',
    'Communication Services': 'İletişim',
    'Healthcare': 'Sağlık',
    'Basic Materials': 'Hammadde',
    'Utilities': 'Kamu Hizmetleri',
    'Real Estate': 'Gayrimenkul',
  };
  return harita[s] || s || null;
}
