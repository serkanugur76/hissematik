// ══════════════════════════════════════════════
// HisseMatik — Merkezi State Yönetimi
// assets/js/state.js
// ══════════════════════════════════════════════

// ─────────────────────────────────────────────
// SABİTLER
// ─────────────────────────────────────────────

export const ADMIN_EMAILS = ['ugurserkan@gmail.com'];

export const DOGRULAMA_GUN_VARSAYILAN = 3;

export const BIST30 = Object.freeze(new Set([
  'AKBNK','ARCLK','ASELS','BIMAS','EREGL','FROTO','GARAN','GUBRF',
  'HALKB','ISCTR','KCHOL','KRDMD','KOZAL','ODAS','PETKM','PGSUS',
  'SAHOL','SASA','SISE','SKBNK','SOKM','TAVHL','TCELL','THYAO',
  'TKFEN','TOASO','TTKOM','TUPRS','VAKBN','YKBNK',
]));

export const BIST100 = Object.freeze(new Set([
  'ACSEL','ADEL','AEFES','AGESA','AKBNK','AKCNS','AKGRT','AKSA',
  'AKSEN','ALARK','ALBRK','ANSGR','ARCLK','ARENA','ASELS','ASTOR',
  'ASUZU','AYDEM','BAGFS','BANVT','BIMAS','BIZIM','BJKAS','BRSAN',
  'BSOKE','BTCIM','BUCIM','CCOLA','CIMSA','CLEBI','CRFSA','DEVA',
  'DOAS','DOHOL','ECILC','EKGYO','ENJSA','ENKAI','EREGL','FENER',
  'FROTO','GARAN','GSRAY','GUBRF','HALKB','HEKTS','INDES','INVEO',
  'ISCTR','ISGYO','IZMDC','IZOCM','KAREL','KARSN','KARTN','KATMR',
  'KCAER','KCHOL','KLKIM','KONTR','KONYO','KORDS','KOZAA','KOZAL',
  'KRDMA','KRDMD','KRONT','LIDER','LOGO','MAVI','MERKO','MIGROS',
  'MPARK','NUHCM','ODAS','OTKAR','OYAKC','PARSN','PETKM','PGSUS',
  'PTOFS','RAYSG','RYSAS','SAHOL','SARKY','SASA','SDTTR','SELEC',
  'SISE','SKBNK','SMART','SNGYO','SOKM','TATGD','TAVHL','TCELL',
  'THYAO','TKFEN','TOASO','TRGYO','TSKB','TTKOM','TTRAK','TUPRS',
  'ULKER','VAKBN','VESBE','VESTL','YKBNK','ZOREN',
]));

/** [kod, şirket adı] çiftleri — proxy'den genişletilebilir */
export const BIST = [
  ['ACSEL','Acıselsan'],['ADEL','Adel Kalemcilik'],['AEFES','Anadolu Efes'],
  ['AGESA','Agesa'],['AKBNK','Akbank'],['AKCNS','Akçansa'],['AKGRT','Aksigorta'],
  ['AKSA','Aksa Akrilik'],['AKSEN','Aksa Enerji'],['ALARK','Alarko Holding'],
  ['ALBRK','Albaraka Türk'],['ANSGR','Anadolu Sigorta'],['ARCLK','Arçelik'],
  ['ARENA','Arena Bilgisayar'],['ASELS','Aselsan'],['ASTOR','Astor Enerji'],
  ['ASUZU','Anadolu Isuzu'],['AYDEM','Aydem Enerji'],['BAGFS','Bagfaş'],
  ['BANVT','Banvit'],['BIMAS','BİM Mağazalar'],['BIZIM','Bizim Toptan'],
  ['BJKAS','Beşiktaş'],['BRSAN','Borusan Mannesmann'],['BSOKE','Bolu Çimento'],
  ['BTCIM','Batıçim'],['BUCIM','Bursa Çimento'],['CCOLA','Coca Cola İçecek'],
  ['CIMSA','Çimsa'],['CLEBI','Çelebi Havacılık'],['CRFSA','Carrefour SA'],
  ['DEVA','Deva Holding'],['DOAS','Doğuş Otomotiv'],['DOHOL','Doğan Holding'],
  ['ECILC','Eczacıbaşı İlaç'],['EKGYO','Emlak Konut GYO'],['ENJSA','Enerjisa'],
  ['ENKAI','Enka İnşaat'],['EREGL','Ereğli Demir Çelik'],['FENER','Fenerbahçe'],
  ['FROTO','Ford Otosan'],['GARAN','Garanti BBVA'],['GSRAY','Galatasaray'],
  ['GUBRF','Gübre Fabrikaları'],['HALKB','Halk Bankası'],['HEKTS','Hektaş'],
  ['INDES','Index Bilgisayar'],['INVEO','Inveo'],['ISCTR','İş Bankası'],
  ['ISGYO','İş GYO'],['IZMDC','İzmir Demir Çelik'],['IZOCM','İzocam'],
  ['KAREL','Karel Elektronik'],['KARSN','Karsan'],['KARTN','Kartonsan'],
  ['KATMR','Katmerciler'],['KCAER','Koca Enerji'],['KCHOL','Koç Holding'],
  ['KLKIM','Kalekim'],['KONTR','Kontrolmatik'],['KONYO','Konya Şeker'],
  ['KORDS','Kordsa'],['KOZAA','Koza Altın'],['KOZAL','Koza Anadolu'],
  ['KRDMA','Kardemir A'],['KRDMD','Kardemir D'],['KRONT','Kronoteks'],
  ['LIDER','Lider Faktoring'],['LOGO','Logo Yazılım'],['MAVI','Mavi Giyim'],
  ['MERKO','Merko Gıda'],['MIGROS','Migros'],['MPARK','Mall of Istanbul'],
  ['NUHCM','Nuh Çimento'],['ODAS','Odaş Elektrik'],['OTKAR','Otokar'],
  ['OYAKC','Oyak Çimento'],['PARSN','Parsan'],['PETKM','Petkim'],
  ['PGSUS','Pegasus'],['PTOFS','Petrol Ofisi'],['RAYSG','Ray Sigorta'],
  ['RYSAS','Reysaş Lojistik'],['SAHOL','Sabancı Holding'],['SARKY','Sarkuysan'],
  ['SASA','Sasa Polyester'],['SDTTR','Sadet'],['SELEC','Selçuk Ecza'],
  ['SISE','Şişe Cam'],['SKBNK','Şekerbank'],['SMART','Smart Güneş'],
  ['SNGYO','Sinpaş GYO'],['SOKM','Şok Marketler'],['TATGD','Tat Gıda'],
  ['TAVHL','TAV Havalimanları'],['TCELL','Turkcell'],['THYAO','Türk Hava Yolları'],
  ['TKFEN','Tekfen Holding'],['TOASO','Tofaş'],['TRGYO','Torunlar GYO'],
  ['TSKB','TSKB'],['TTKOM','Türk Telekom'],['TTRAK','Türk Traktör'],
  ['TUPRS','Tüpraş'],['ULKER','Ülker'],['VAKBN','Vakıfbank'],
  ['VESBE','Vestel Beyaz Eşya'],['VESTL','Vestel'],['YKBNK','Yapı Kredi'],
  ['ZOREN','Zorlu Enerji'],
];

export function hisseAdi(kod) {
  const bulunan = BIST.find(([k]) => k === kod);
  return bulunan ? bulunan[1] : kod;
}

// ─────────────────────────────────────────────
// STATE — merkezi uygulama verisi
// ─────────────────────────────────────────────

export const state = {

  // ── Kullanıcı ──────────────────────────────
  /** Firebase Auth kullanıcı objesi | null */
  currentUser: null,

  /** Firestore'daki kullanıcı dokümanı | {} */
  userDoc: {},

  /** true → giriş yapan kişi admin */
  isAdmin: false,

  // ── API Anahtarı ───────────────────────────
  /**
   * Kullanıcının çözülmüş (plaintext) Anthropic API key'i.
   * Firestore'dan encryptedApiKey okunur, login sırasında
   * AES-GCM ile çözülür ve buraya yazılır.
   * Hiçbir zaman Firestore'a düz metin olarak kaydedilmez.
   */
  anthropicKey: '',

  // ── Hisse Verileri ─────────────────────────
  veriler:    {},
  takipEdilen: new Set(),
  portfoy:    {},
  portfoyAltin: {},
  portfoyDoviz: {},
  fiyatAlarmlari: [],
  hisseNotlari:   {},
  temettu:        [],

  // ── Sinyal Geçmişi ─────────────────────────
  sinyalGecmisi: [],
  dogrulamaGun:  DOGRULAMA_GUN_VARSAYILAN,

  // ── Piyasa Genel Verisi ────────────────────
  piyasaVerisi: {},

  // ── Haberler ──────────────────────────────
  haberlerData:    [],
  haberlerYuklendi: false,

  // ── UI State ───────────────────────────────
  aktifFilter: 'tum',
  portfoyKod:  null,
  detayKod:    null,

  /** AI'ın bugün çalışıp çalışmadığını takip eder */
  sonAiTarih: null,
};

// ─────────────────────────────────────────────
// setState — yüzeysel birleştirme
// ─────────────────────────────────────────────

export function setState(parcialState) {
  Object.assign(state, parcialState);
}

// ─────────────────────────────────────────────
// resetState — oturum kapanınca temizle
// ─────────────────────────────────────────────

export function resetState() {
  state.currentUser     = null;
  state.userDoc         = {};
  state.isAdmin         = false;
  state.anthropicKey    = '';
  state.veriler         = {};
  state.takipEdilen     = new Set();
  state.portfoy         = {};
  state.portfoyAltin    = {};
  state.portfoyDoviz    = {};
  state.fiyatAlarmlari  = [];
  state.hisseNotlari    = {};
  state.temettu         = [];
  state.sinyalGecmisi   = [];
  state.dogrulamaGun    = DOGRULAMA_GUN_VARSAYILAN;
  state.piyasaVerisi    = {};
  state.haberlerData    = [];
  state.haberlerYuklendi = false;
  state.aktifFilter     = 'tum';
  state.portfoyKod      = null;
  state.detayKod        = null;
  state.sonAiTarih      = null;
}

// ─────────────────────────────────────────────
// TÜRETILMIŞ OKUYUCULAR
// ─────────────────────────────────────────────

/**
 * Aktif API anahtarı.
 * Kullanıcıya özel key yoksa '' döner → AI butonları kilitlenir.
 */
export function aktifKey() {
  return state.anthropicKey || '';
}

/** AI bugün çalıştı mı? */
export function aiGecenBugundeMi() {
  const bugun = new Date().toLocaleDateString('tr-TR');
  return state.sonAiTarih === bugun;
}

/** AI tetiklenip tetiklenmeyeceğini hesapla */
export function aiGerekliMi() {
  if (state.takipEdilen.size === 0) return false;
  if (!aktifKey())                  return false;
  if (aiGecenBugundeMi())           return false;

  // Sabah penceresi (09:30–10:30)
  const saat = new Date().getHours();
  if (saat >= 9 && saat <= 10) return true;

  // Kritik sinyal var mı?
  for (const k of state.takipEdilen) {
    const v = state.veriler[k];
    if (!v) continue;
    if (v.rsi < 25 || v.rsi > 75)                            return true;
    if (v.sinyal === 'GÜÇLÜ AL' || v.sinyal === 'GÜÇLÜ SAT') return true;
    if (Math.abs(v.degisim) >= 5)                             return true;
  }
  return false;
}

/** AI çalıştı — tarihi state'e yaz */
export function aiCalistiKaydet() {
  state.sonAiTarih = new Date().toLocaleDateString('tr-TR');
}

/** Portföy toplam K/Z özeti */
export function portfoyOzeti() {
  let totMaliyet = 0, totDeger = 0;
  for (const [k, p] of Object.entries(state.portfoy)) {
    const v   = state.veriler[k];
    const mal = p.adet * p.alisFiyati;
    const deg = v?.fiyat ? p.adet * v.fiyat : mal;
    totMaliyet += mal;
    totDeger   += deg;
  }
  const kz  = totDeger - totMaliyet;
  const kzp = totMaliyet > 0 ? (kz / totMaliyet * 100) : 0;
  return { totMaliyet, totDeger, kz, kzp };
}

/** Sinyal istatistikleri */
export function sinyalIstatistik() {
  const dogru  = state.sinyalGecmisi.filter(s => s.dogrulandi === true).length;
  const yanlis = state.sinyalGecmisi.filter(s => s.dogrulandi === false).length;
  const toplam = dogru + yanlis;
  const isabet = toplam > 0 ? Math.round(dogru / toplam * 100) : null;
  return { dogru, yanlis, toplam, isabet };
}