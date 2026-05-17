// Vercel Serverless Function — Kampanya Kodu Üret
// POST /api/kod-uret
// ManyChat HTTP Action tarafından çağrılır

const SECRET     = 'HM2026BIST';
const GECERLILIK = 7; // gün

// Blogger/kampanya.js ile aynı algoritma (Node.js portu)
function _hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++)
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

function kodUret() {
  const bitis  = Math.floor(Date.now() / 86400000) + GECERLILIK;
  const salt   = Math.floor(Math.random() * 46655).toString(36).toUpperCase().padStart(3, '0');
  const bitisB = bitis.toString(36).toUpperCase().padStart(4, '0');
  const imza   = _hash(SECRET + bitis).toString(36).toUpperCase().padStart(6, '0').slice(0, 5);
  return `HM-${bitisB}${imza.slice(0, 2)}-${salt}${imza.slice(2, 5)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basit güvenlik: isteğe bağlı secret header kontrolü
  const gelen = req.headers['x-api-secret'] || req.query.secret || '';
  const beklenen = process.env.KOD_SECRET || '';
  if (beklenen && gelen !== beklenen) {
    return res.status(401).json({ hata: 'Yetkisiz istek' });
  }

  try {
    const kod = kodUret();
    return res.status(200).json({
      kod,
      gecerlilikGun: GECERLILIK,
      mesaj: `HisseMATİK kampanya kodunuz: ${kod}\n\nhissematik.app adresine gidin, kodu giriş ekranına yapıştırıp Google ile giriş yapın. Kod 7 gün geçerli, tek kullanımlık.`,
    });
  } catch (e) {
    return res.status(500).json({ hata: 'Kod üretilemedi: ' + e.message });
  }
}
