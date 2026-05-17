// ══════════════════════════════════════════════
// HisseMatik — Kampanya Kod Algoritması
// assets/js/kampanya.js
// Hem Blogger (inline) hem HisseMatik'te kullanılır
// ══════════════════════════════════════════════

const _SECRET = 'HM2026BIST';

function _hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++)
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0);
}

/**
 * Kampanya kodu üretir.
 * Format: HM-XXXXXX-XXXXXX
 * @param {number} gecerlilikGun - kaç gün geçerli (varsayılan 7)
 * @returns {string} kod
 */
export function kampanyaKoduUret(gecerlilikGun = 7) {
  const bitis   = Math.floor(Date.now() / 86400000) + gecerlilikGun;
  const salt    = Math.floor(Math.random() * 46655).toString(36).toUpperCase().padStart(3, '0');
  const bitisB  = bitis.toString(36).toUpperCase().padStart(4, '0');
  const imza    = _hash(_SECRET + bitis).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);

  // Format: HM-[bitis4][imza3]-[salt3][imza3son]
  return `HM-${bitisB}${imza.slice(0, 2)}-${salt}${imza.slice(2, 5)}`;
}

/**
 * Kodu doğrular.
 * @param {string} kod
 * @returns {{ gecerli: boolean, sebep?: string, kalanGun?: number }}
 */
export function kampanyaKoduDogrula(kod) {
  if (!kod) return { gecerli: false, sebep: 'Kod boş' };

  const clean = kod.toUpperCase().replace(/[-\s]/g, '');

  if (!clean.startsWith('HM') || clean.length !== 12)
    return { gecerli: false, sebep: 'Kod formatı hatalı' };

  const payload = clean.slice(2);           // 10 karakter
  const bitisB  = payload.slice(0, 4);      // bitis günü base36
  const imzaA   = payload.slice(4, 6);      // imza ilk 2
  const salt    = payload.slice(6, 9);      // salt (doğrulamada kullanılmaz)
  const imzaB   = payload.slice(9, 12);     // imza son 3

  const bitis   = parseInt(bitisB, 36);
  if (isNaN(bitis) || bitis < 1)
    return { gecerli: false, sebep: 'Geçersiz kod' };

  const beklenen = _hash(_SECRET + bitis).toString(36).toUpperCase().padStart(6, '0').slice(0, 5);

  if ((imzaA + imzaB) !== beklenen)
    return { gecerli: false, sebep: 'Geçersiz kod' };

  const bugun = Math.floor(Date.now() / 86400000);
  if (bugun > bitis)
    return { gecerli: false, sebep: 'Kodun süresi dolmuş', kalanGun: 0 };

  return { gecerli: true, kalanGun: bitis - bugun };
}
