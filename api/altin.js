// Vercel Serverless Function — Türk Altın Fiyatları
// GET /api/altin
// finans.truncgil.com/today.json kaynağından anlık fiyat çeker

const KAYNAK = 'https://finans.truncgil.com/today.json';

function parseFiyat(str) {
  if (!str) return 0;
  // "$4.557,94" veya "6.654,38" → sayıya çevir
  // Önce para birimi sembolü ve % gibi karakterleri at, sonra TR formatını dönüştür
  const temiz = String(str).replace(/[^0-9.,\-]/g, '');
  return parseFloat(temiz.replace(/\./g, '').replace(',', '.')) || 0;
}

function parseDegisim(str) {
  if (!str) return 0;
  // "%0,53" veya "-1,23" → sayıya çevir
  const temiz = String(str).replace(/[^0-9.,-]/g, '');
  return parseFloat(temiz.replace(',', '.')) || 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch(KAYNAK, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error('Kaynak yanıt vermedi: ' + response.status);

    const data = await response.json();

    const gram    = data['gram-altin'];
    const ceyrek  = data['ceyrek-altin'];
    const yarim   = data['yarim-altin'];
    const tam     = data['tam-altin'];
    const ons     = data['ons'];

    return res.status(200).json({
      gramTL:    parseFiyat(gram?.Satış   || gram?.Alis),
      ceyrekTL:  parseFiyat(ceyrek?.Satış || ceyrek?.Alis),
      yarimTL:   parseFiyat(yarim?.Satış  || yarim?.Alis),
      tamTL:     parseFiyat(tam?.Satış    || tam?.Alis),
      onsUsd:    parseFiyat(ons?.Satış    || ons?.Alis),
      degisim:   parseDegisim(gram?.Değişim || gram?.Degisim),
      guncelleme: data['Update_Date'] || null,
    });
  } catch (e) {
    return res.status(500).json({ hata: 'Altın fiyatı alınamadı: ' + e.message });
  }
}
