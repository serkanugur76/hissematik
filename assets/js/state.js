// ══════════════════════════════════════════════
// HisseMatik — Merkezi State Yönetimi
// assets/js/state.js
//
// Tek sorumluluk: uygulamanın tüm verisi burada
// yaşar. Hiçbir dosya kendi içinde global değişken
// tanımlamaz; hepsi buradan okur / buraya yazar.
//
// Kullanım:
//   import { state, setState, resetState } from './state.js';
//
//   state.veriler['THYAO']          // okuma
//   setState({ havuzKey: '...' })   // güncelleme
//   state.takipEdilen.add('GARAN')  // Set/obje mutasyonu (doğrudan)
// ══════════════════════════════════════════════


// ─────────────────────────────────────────────
// SABİTLER — hiç değişmez, sadece okunur
// ─────────────────────────────────────────────

export const ADMIN_EMAILS = ['ugurserkan@gmail.com'];

export const DOGRULAMA_GUN_VARSAYILAN = 7;

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

/** [kod, şirket adı] çiftleri — tüm BIST hisseleri */
export const BIST = [
  ['ACSEL','Açıselsan'],['ADEL','Adel Kalemcilik'],['AEFES','Anadolu Efes'],
  ['AGESA','AgeS Emeklilik'],['AGHOL','AG Anadolu Grubu'],['AKBNK','Akbank'],
  ['AKCNS','Akçansa'],['AKENR','Ak Enerji'],['AKGRT','Aksigorta'],
  ['AKSA','Aksa Akrilik'],['AKSEN','Aksa Enerji'],['ALARK','Alarko Holding'],
  ['ALBRK','Albaraka Türk'],['ALCAR','Alarko Carrier'],['ALKIM','Alkim Kağıt'],
  ['ANELE','Anel Elektrik'],['ANHYT','Anadolu Hayat'],['ANSGR','Anadolu Sigorta'],
  ['ARCLK','Arçelik'],['ARENA','Arena Bilgisayar'],['ARSAN','Arsan Tekstil'],
  ['ASELS','Aselsan'],['ASTOR','Astor Enerji'],['ASUZU','Anadolu Isuzu'],
  ['AYDEM','Aydem Enerji'],['AYEN','Ayen Enerji'],['BAGFS','Bagfas Gübre'],
  ['BANVT','Banvit'],['BIMAS','BIM Birleşik Mağazalar'],['BIZIM','Bizim Toptan'],
  ['BJKAS','Beşiktaş JK'],['BOSSA','Bossa Ticaret'],['BRSAN','Borusan Mannesmann'],
  ['BRYAT','Borusan Yatırım'],['BSOKE','Batısöke Çimento'],['BTCIM','Batı Çimento'],
  ['BUCIM','Bursa Çimento'],['CCOLA','Coca Cola İçecek'],['CELHA','Çelik Halat'],
  ['CIMSA','Çimsa'],['CLEBI','Çelebi Hava'],['CRFSA','Carrefoursa'],
  ['DARDL','Dardanel'],['DESA','Desa Deri'],['DESPC','Despec Bilgisayar'],
  ['DEVA','Deva Holding'],['DITAS','Ditaş'],['DOAS','Doğuş Otomotiv'],
  ['DOHOL','Doğan Holding'],['ECILC','Eczacıbaşı İlaç'],['ECZYT','Eczacıbaşı Yatırım'],
  ['EGEEN','Ege Endüstri'],['EGGUB','Ege Gübre'],['EGSER','Ege Seramik'],
  ['EKGYO','Emlak Konut GYO'],['ENJSA','Enerjisa Enerji'],['ENKAI','Enka İnşaat'],
  ['EPLAS','Egeplast'],['ERBOS','Erbosan'],['EREGL','Ereğli Demir Çelik'],
  ['FENER','Fenerbahçe'],['FROTO','Ford Otosan'],['GARAN','Garanti BBVA'],
  ['GARFA','Garanti Faktoring'],['GEDIK','Gedik Yatırım'],['GENTS','Gentaş'],
  ['GEREL','Gersan Elektrik'],['GLYHO','Global Yatırım'],['GMTAS','Gümüştaş'],
  ['GOLTS','Göltaş Çimento'],['GOODY','Goodyear'],['GSRAY','Galatasaray'],
  ['GUBRF','Gübre Fabrikaları'],['GUSGR','Güneş Sigorta'],['HALKB','Halkbank'],
  ['HATEK','Hateks'],['HEKTS','Hektaş'],['HTTBT','Hattat Holding'],
  ['HURGZ','Hürriyet Gazetecilik'],['ICBCT','ICBC Turkey'],['IHLAS','İhlas Holding'],
  ['INDES','İndeks Bilgisayar'],['INFO','İnfo Yatırım'],['INTEM','İntema'],
  ['INVEO','Inveo Yatırım'],['IPEKE','İpek Doğal Enerji'],['ISCTR','İş Bankası C'],
  ['ISGYO','İş GYO'],['ISKUR','İş Kuleleri'],['ITTFH','İttifak Holding'],
  ['IZMDC','İzmir Demir Çelik'],['IZOCM','İzocam'],['JANTS','Jantsa Jant'],
  ['KAREL','Karel Elektronik'],['KARSN','Karsan'],['KARTN','Kartonsan'],
  ['KATMR','Katmerciler'],['KAYSE','Kayseri Şeker'],['KCAER','Kocaer Çelik'],
  ['KCHOL','Koç Holding'],['KENT','Kent Gıda'],['KLKIM','Kalekim'],
  ['KLSER','Kale Seramik'],['KONTR','Kontrolmatik'],['KONYO','Konya Çimento'],
  ['KORDS','Kordsa'],['KOTON','Koton'],['KOZAA','Koza Altın'],
  ['KOZAL','Koza Altın İşletmeleri'],['KRDMA','Kardemir A'],['KRDMB','Kardemir B'],
  ['KRDMD','Kardemir D'],['KRONT','Kron Telekom'],['KUTPO','Kütahya Porselen'],
  ['LIDER','Lider Faktoring'],['LOGO','Logo Yazılım'],['MAKIM','Makina Takım'],
  ['MANAS','Manas Enerji'],['MARTI','Martı Otel'],['MAVI','Mavi Giyim'],
  ['MEPET','Mepet Petrol'],['MERKO','Merko Gıda'],['METRO','Metro Ticaret'],
  ['MIGROS','Migros Ticaret'],['MPARK','Medical Park'],['MRSHL','Marshall Boya'],
  ['MTRKS','Matriks Bilgi'],['NETAS','Netaş'],['NTHOL','Net Holding'],
  ['NUHCM','Nuh Çimento'],['ODAS','Odaş Elektrik'],['ORGE','Orge Enerji'],
  ['OTKAR','Otokar'],['OYAKC','Oyak Çimento'],['OYLUM','Oylum Sınai'],
  ['PAMEL','Pamel'],['PARSN','Parsan'],['PENGD','Penguen Gıda'],
  ['PENTA','Penta Teknoloji'],['PETKM','Petkim'],['PETUN','Pınar Et'],
  ['PGSUS','Pegasus Hava'],['PINSU','Pınar Su'],['POLHO','Polisan Holding'],
  ['PRDGS','Paradox GYO'],['PRKAB','Pınar Kablo'],['PTOFS','Petrol Ofisi'],
  ['RAYSG','Ray Sigorta'],['RYSAS','Rönesans Holding'],['SAHOL','Sabancı Holding'],
  ['SANKO','Sanko'],['SARKY','Sarkuysan'],['SASA','Sasa Polyester'],
  ['SDTTR','SDT Uzay'],['SELEC','Selçuk Ecza'],['SELGD','Selçuk Gıda'],
  ['SISE','Şişe Cam'],['SKBNK','Şekerbank'],['SMART','Smart Güneş'],
  ['SNGYO','Sinpaş GYO'],['SOKM','Şok Marketler'],['SONME','Sönmez Filament'],
  ['SUWEN','Suwen İç Giyim'],['TATGD','Tat Gıda'],['TAVHL','TAV Havalimanları'],
  ['TBORG','Türk Tuborg'],['TCELL','Turkcell'],['THYAO','Türk Hava Yolları'],
  ['TKFEN','Tekfen Holding'],['TKNSA','Teknosa'],['TOASO','Tofaş Otomobil'],
  ['TRCAS','Türkiye Reasürans'],['TRGYO','Torunlar GYO'],['TSKB','TSKB'],
  ['TSPOR','Trabzonspor'],['TTKOM','Türk Telekom'],['TTRAK','Türk Traktör'],
  ['TUPRS','Tüpraş'],['TURSG','Türk Sigorta'],['ULKER','Ülker Bisküvi'],
  ['ULUSE','Ulusoy Elektrik'],['UNLU','Ünlü Tekstil'],['USAK','Uşak Seramik'],
  ['VAKBN','Vakıfbank'],['VAKGM','Vakıf GYO'],['VESBE','Vestel Beyaz Eşya'],
  ['VESTL','Vestel Elektronik'],['WINTA','Wintax'],['YATAS','Yataş'],
  ['YKBNK','Yapı Kredi'],['YONGA','Yonga Mobilya'],['YUNSA','Yünsa'],
  ['ZOREN','Zorlu Enerji'],['ZRGYO','Ziraat GYO'],
  // Ek hisseler
  ['ARMGD','Armada Gıda'],['BHMDR','Bahadır Kimya'],['AGROT','Agrotür'],
  ['AHSGY','Ahlatcı Sosyal GYO'],['ATAGY','Ata GYO'],['ALTNY','Altınyunus'],
  ['ALVES','Alves'],['ALCTL','Alcatel'],['AKSGY','Aksa GYO'],['AKSUE','Aksu Enerji'],
  ['ARDYZ','Ardyz'],['ARTMS','Artemas'],['ARZUM','Arzum'],['ARASE','Arase'],
  ['ASGYO','As GYO'],['ATEKS','Altınyıldız Tekstil'],['ATLAS','Atlas Menkul'],
  ['AVGYO','Avrasya GYO'],['AVHOL','Avrasya Holding'],['AVOD','A.V.O.D.'],
  ['AZTEK','Aztek'],['BAKAB','Bak Ambalaj'],['BASCM','Başkent Çimento'],
  ['BASGZ','Başer Gaz'],['BEGYO','Beykoz GYO'],['BERA','Bera Holding'],
  ['BIGCH','Birleşik Çimento'],['BIGEN','Bigen'],['BIENY','Bienyatırım'],
  ['BFREN','Bosch Fren'],['BARMA','Barma'],['BALSU','Bal Su'],
  ['BESTE','Beste'],['BEYAZ','Beyaz Filo'],['ADESE','Adese AVM'],
  ['ADGYO','Adnan Gıda GYO'],['AFYON','Afyon Çimento'],
  ['AGYO','Atakule GYO'],['AHGAZ','Ahlatcı Doğalgaz'],
];


// ─────────────────────────────────────────────
// ANA STATE OBJESİ
//
// Kural: Bu objenin şeması değişmez.
// Yeni bir alan eklenmesi gerekirse buraya eklenir,
// setState() ile güncellenir.
// ─────────────────────────────────────────────

export const state = {

  // ── Kullanıcı ──────────────────────────────
  /** Firebase Auth kullanıcı objesi | null */
  currentUser: null,

  /** Firestore'daki kullanıcı dokümanı | {} */
  userDoc: {},

  /** true → giriş yapan kişi admin */
  isAdmin: false,

  // ── API Anahtarları ────────────────────────
  /** Firestore config/global'den yüklenen havuz key */
  havuzKey: '',

  /** Kullanıcı kendi key'ini tanımladıysa (genelde havuzKey üzerine yazar) */
  anthropicKey: '',

  // ── Hisse Verileri ─────────────────────────
  /**
   * { [sembol]: HisseVeri }
   * HisseVeri: { fiyat, degisim, rsi, macd, macdHist,
   *              ma20, ma50, bollinger, sinyal, hacimFark, … }
   */
  veriler: {},

  /**
   * Set<string> — takip edilen hisse kodları
   * Doğrudan mutasyon: state.takipEdilen.add('GARAN')
   */
  takipEdilen: new Set(),

  /**
   * { [sembol]: PortfoyKaydi }
   * PortfoyKaydi: { adet, alisFiyati, alisTarihi, ad }
   */
  portfoy: {},

  // ── Sinyal Geçmişi ─────────────────────────
  /**
   * Firestore'dan yüklenen sinyal kayıtları (desc tarih)
   * Her eleman: { id, sembol, sinyal, fiyat, tarih,
   *               dogrulandi, sonucYuzde, … }
   */
  sinyalGecmisi: [],

  /** Sinyal doğrulama penceresi (gün cinsinden) */
  dogrulamaGun: DOGRULAMA_GUN_VARSAYILAN,

  // ── Piyasa Genel Verisi ────────────────────
  /**
   * { xu100, usdtry, eurtry, yon }
   * xu100: { fiyat, degisim }
   * yon: BIST100 günlük değişim (%) — sinyalPiyasaFiltrele için
   */
  piyasaVerisi: {},

  // ── Haberler ──────────────────────────────
  /**
   * Proxy'den çekilen haber listesi
   * Her eleman: { baslik, aciklama, link, kaynak, tarih }
   */
  haberlerData: [],

  /** true → haberler bu oturumda zaten yüklendi */
  haberlerYuklendi: false,

  // ── UI State ───────────────────────────────
  /** Hisse listesi aktif filtresi: 'tum'|'takip'|'portfoy'|'bist30'|'bist100' */
  aktifFilter: 'tum',

  /** Portföy modalı için geçici seçili hisse kodu */
  portfoyKod: null,

  /** Detay paneli için geçici seçili hisse kodu */
  detayKod: null,

  /** AI'ın bugün çalışıp çalışmadığını takip eder */
  sonAiTarih: null,
};


// ─────────────────────────────────────────────
// setState — yüzeysel birleştirme (shallow merge)
//
// Primitive alanlar için kullan:
//   setState({ havuzKey: 'sk-ant-...' })
//   setState({ aktifFilter: 'bist30', detayKod: 'THYAO' })
//
// Set / obje alanlarını doğrudan mutasyonla güncelle:
//   state.takipEdilen.add('GARAN')
//   state.veriler['THYAO'] = { fiyat: 250, … }
//   state.portfoy['FROTO'] = { adet: 10, … }
// ─────────────────────────────────────────────

export function setState(parcialState) {
  Object.assign(state, parcialState);
}


// ─────────────────────────────────────────────
// resetState — oturum kapanınca temizle
// currentUser, veriler, portföy, takip vb.
// BIST listesi ve sabitler korunur.
// ─────────────────────────────────────────────

export function resetState() {
  state.currentUser    = null;
  state.userDoc        = {};
  state.isAdmin        = false;
  state.havuzKey       = '';
  state.anthropicKey   = '';
  state.veriler        = {};
  state.takipEdilen    = new Set();
  state.portfoy        = {};
  state.sinyalGecmisi  = [];
  state.dogrulamaGun   = DOGRULAMA_GUN_VARSAYILAN;
  state.piyasaVerisi   = {};
  state.haberlerData   = [];
  state.haberlerYuklendi = false;
  state.aktifFilter    = 'tum';
  state.portfoyKod     = null;
  state.detayKod       = null;
  state.sonAiTarih     = null;
}


// ─────────────────────────────────────────────
// TÜRETILMIŞ OKUYUCULAR (computed getters)
// Sık kullanılan state hesaplamalarını merkezde tut,
// UI/app katmanları bu fonksiyonları çağırır.
// ─────────────────────────────────────────────

/** Aktif API anahtarı (havuzKey öncelikli) */
export function aktifKey() {
  return state.havuzKey || state.anthropicKey;
}

/** AI bugün çalıştı mı? */
export function aiGecenBugundeMi() {
  const bugun = new Date().toLocaleDateString('tr-TR');
  return state.sonAiTarih === bugun;
}

/** AI tetiklenip tetiklenmeyeceğini hesapla */
export function aiGerekliMi() {
  if (state.takipEdilen.size === 0)           return false;
  if (!aktifKey())                            return false;
  if (aiGecenBugundeMi())                     return false;

  // Sabah penceresi (09:30–10:30)
  const saat = new Date().getHours();
  if (saat >= 9 && saat <= 10)               return true;

  // Portföyde kritik sinyal var mı?
  for (const k of state.takipEdilen) {
    const v = state.veriler[k];
    if (!v) continue;
    if (v.rsi < 25 || v.rsi > 75)                           return true;
    if (v.sinyal === 'GÜÇLÜ AL' || v.sinyal === 'GÜÇLÜ SAT') return true;
    if (Math.abs(v.degisim) >= 5)                           return true;
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

/** BIST listesinde hisse adını döner */
export function hisseAdi(kod) {
  return BIST.find(b => b[0] === kod)?.[1] || '';
}
