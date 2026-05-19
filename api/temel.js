// Vercel Serverless Function — Temel Analiz Verileri
// GET /api/temel?sembol=THYAO
//
// Yahoo Finance quoteSummary üzerinden F/K, PD/DD, piyasa değeri,
// temettü verimi, ROE, borç oranı gibi temel verileri döner.
// Crumb mekanizması: önce quote sayfasından crumb+cookie alınır.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function getCrumbAndCookie(ticker) {
  const res = await fetch(`https://finance.yahoo.com/quote/${ticker}`, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error('Yahoo Finance sayfası yüklenemedi: ' + res.status);

  const html  = await res.text();
  const match = html.match(/"crumb":"([^"]+)"/);
  if (!match) throw new Error('Crumb bulunamadı');

  const crumb  = match[1].replace(/\\u002F/g, '/');
  const cookie = (res.headers.get('set-cookie') || '')
    .split(',')
    .map(c => c.split(';')[0].trim())
    .filter(c => c.includes('='))
    .join('; ');

  return { crumb, cookie };
}

function n(obj, key) {
  const v = obj?.[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v.raw ?? null;
  return typeof v === 'number' ? v : null;
}

function pct(obj, key) {
  const v = n(obj, key);
  return v !== null ? +(v * 100).toFixed(2) : null;
}

function fmt(v, d = 2) {
  return v !== null && !isNaN(v) ? +v.toFixed(d) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sembol } = req.query;
  if (!sembol) return res.status(400).json({ hata: 'sembol parametresi gerekli' });

  const ticker = sembol.toUpperCase().replace('.IS', '') + '.IS';

  try {
    const { crumb, cookie } = await getCrumbAndCookie(ticker);

    const url =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile` +
      `&formatted=false&lang=en-US&region=TR&crumb=${encodeURIComponent(crumb)}`;

    const dataRes = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Cookie': cookie,
        'Referer': 'https://finance.yahoo.com/',
      },
      signal: AbortSignal.timeout(8000),
    });

    const json   = await dataRes.json();
    const result = json?.quoteSummary?.result?.[0];

    if (!result) {
      const err = json?.quoteSummary?.error;
      return res.status(404).json({ hata: err?.description || 'Veri bulunamadı' });
    }

    const sd = result.summaryDetail        || {};
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData        || {};
    const ap = result.assetProfile         || {};

    const veri = {
      // Değerleme
      fk:           fmt(n(sd, 'trailingPE')),
      ileriFK:      fmt(n(sd, 'forwardPE')),
      pddd:         fmt(n(ks, 'priceToBook')),
      fiyatSatis:   fmt(n(ks, 'priceToSalesTrailingTwelveMonths')),
      evEbitda:     fmt(n(ks, 'enterpriseToEbitda')),
      piyasaDegeri: n(sd, 'marketCap'),

      // Kârlılık
      eps:          fmt(n(ks, 'trailingEps')),
      roe:          pct(fd, 'returnOnEquity'),
      roa:          pct(fd, 'returnOnAssets'),
      netKarMarji:  pct(fd, 'profitMargins'),
      brutMarji:    pct(fd, 'grossMargins'),

      // Temettü
      temettuVerimi: pct(sd, 'dividendYield'),
      temettuOrani:  pct(sd, 'payoutRatio'),

      // Borç & Büyüme
      borcOzkaynak: fmt(n(fd, 'debtToEquity')),
      nakit:        fmt(n(fd, 'totalCashPerShare')),
      gelirBuyume:  pct(fd, 'revenueGrowth'),
      karBuyume:    pct(fd, 'earningsGrowth'),

      // Genel
      beta:      fmt(n(sd, 'beta')),
      sektor:    ap.sector   || null,
      sektorTR:  _sektorCevir(ap.sector),
      aciklama:  ap.longBusinessSummary || null,
    };

    return res.status(200).json({ sembol: sembol.toUpperCase(), veri });

  } catch (e) {
    console.error('temel API hatası:', ticker, e?.message);
    return res.status(500).json({ hata: e?.message || 'Sunucu hatası' });
  }
}

function _sektorCevir(s) {
  const h = {
    'Financial Services':      'Finansal Hizmetler',
    'Industrials':             'Sanayi',
    'Consumer Cyclical':       'Tüketim (Döngüsel)',
    'Consumer Defensive':      'Tüketim (Savunmacı)',
    'Energy':                  'Enerji',
    'Technology':              'Teknoloji',
    'Communication Services':  'İletişim',
    'Healthcare':              'Sağlık',
    'Basic Materials':         'Hammadde',
    'Utilities':               'Kamu Hizmetleri',
    'Real Estate':             'Gayrimenkul',
  };
  return h[s] || s || null;
}
