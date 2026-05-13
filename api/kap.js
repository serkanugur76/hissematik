// Vercel Serverless Function — KAP Bildirimleri
// /api/kap?sonrasi=INDEX

const BIST_MAP = [
  ['ACSEL','acıselsan'],['ADEL','adel'],['AEFES','anadolu efes'],
  ['AGESA','agesa'],['AKBNK','akbank'],['AKCNS','akçansa'],['AKGRT','aksigorta'],
  ['AKSA','aksa akrilik'],['AKSEN','aksa enerji'],['ALARK','alarko'],
  ['ALBRK','albaraka'],['ANSGR','anadolu sigorta'],['ARCLK','arçelik'],
  ['ARENA','arena bilgisayar'],['ASELS','aselsan'],['ASTOR','astor enerji'],
  ['ASUZU','anadolu isuzu'],['AYDEM','aydem enerji'],['BAGFS','bagfaş'],
  ['BANVT','banvit'],['BIMAS','bim mağazalar'],['BIZIM','bizim toptan'],
  ['BJKAS','beşiktaş'],['BRSAN','borusan'],['BSOKE','bolu çimento'],
  ['BTCIM','batıçim'],['BUCIM','bursa çimento'],['CCOLA','coca cola içecek'],
  ['CIMSA','çimsa'],['CLEBI','çelebi havacılık'],['CRFSA','carrefour'],
  ['DEVA','deva holding'],['DOAS','doğuş otomotiv'],['DOHOL','doğan holding'],
  ['ECILC','eczacıbaşı'],['EKGYO','emlak konut'],['ENJSA','enerjisa'],
  ['ENKAI','enka'],['EREGL','ereğli demir'],['FENER','fenerbahçe'],
  ['FROTO','ford otosan'],['GARAN','garanti'],['GSRAY','galatasaray'],
  ['GUBRF','gübre fabrikaları'],['HALKB','halk bankası'],['HEKTS','hektaş'],
  ['INDES','index bilgisayar'],['INVEO','inveo'],['ISCTR','iş bankası'],
  ['ISGYO','iş gyo'],['IZMDC','izmir demir çelik'],['IZOCM','izocam'],
  ['KAREL','karel'],['KARSN','karsan'],['KARTN','kartonsan'],
  ['KATMR','katmerciler'],['KCAER','koca enerji'],['KCHOL','koç holding'],
  ['KLKIM','kalekim'],['KONTR','kontrolmatik'],['KONYO','konya şeker'],
  ['KORDS','kordsa'],['KOZAA','koza altın'],['KOZAL','koza anadolu'],
  ['KRDMA','kardemir'],['KRDMD','kardemir'],['KRONT','kronoteks'],
  ['LIDER','lider faktoring'],['LOGO','logo yazılım'],['MAVI','mavi giyim'],
  ['MERKO','merko gıda'],['MIGROS','migros'],['MPARK','mall of istanbul'],
  ['NUHCM','nuh çimento'],['ODAS','odaş'],['OTKAR','otokar'],
  ['OYAKC','oyak çimento'],['PARSN','parsan'],['PETKM','petkim'],
  ['PGSUS','pegasus'],['PTOFS','petrol ofisi'],['RAYSG','ray sigorta'],
  ['RYSAS','reysaş'],['SAHOL','sabancı'],['SARKY','sarkuysan'],
  ['SASA','sasa polyester'],['SELEC','selçuk ecza'],
  ['SISE','şişe cam'],['SKBNK','şekerbank'],['SMART','smart güneş'],
  ['SNGYO','sinpaş'],['SOKM','şok marketler'],['TATGD','tat gıda'],
  ['TAVHL','tav havalimanları'],['TCELL','turkcell'],['THYAO','türk hava yolları'],
  ['TKFEN','tekfen'],['TOASO','tofaş'],['TRGYO','torunlar'],
  ['TSKB','tskb'],['TTKOM','türk telekom'],['TTRAK','türk traktör'],
  ['TUPRS','tüpraş'],['ULKER','ülker'],['VAKBN','vakıfbank'],
  ['VESBE','vestel beyaz eşya'],['VESTL','vestel'],['YKBNK','yapı kredi'],
  ['ZOREN','zorlu enerji'],
];

function trNorm(s) {
  return s.toLowerCase()
    .replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u')
    .replace(/ö/g,'o').replace(/ı/g,'i').replace(/ç/g,'c')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}

function sirketKodlari(ad) {
  if (!ad) return [];
  const n = trNorm(ad);
  return BIST_MAP
    .filter(([, name]) => {
      const nn = trNorm(name);
      return n.includes(nn) || nn.split(' ').every(w => w.length > 2 && n.includes(w));
    })
    .map(([kod]) => kod);
}

function isoTarih(t) {
  if (!t) return '';
  const m = t.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : t;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const response = await fetch('https://www.kap.org.tr/tr/api/disclosure/list/light', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer':         'https://www.kap.org.tr/tr/',
        'Origin':          'https://www.kap.org.tr',
      },
    });

    if (!response.ok) {
      return res.status(200).json({ error: 'KAP API hatası: ' + response.status, bildirimler: [] });
    }

    const raw = await response.json();
    const liste = Array.isArray(raw) ? raw : [];

    const sonrasiNum = parseInt(req.query.sonrasi || '0', 10);

    const bildirimler = liste
      .filter(item => !sonrasiNum || item.disclosureIndex > sonrasiNum)
      .map(item => ({
        index:       item.disclosureIndex || 0,
        tarih:       isoTarih(item.publishDate),
        baslik:      item.summary  || item.subject || '',
        tip:         item.subject  || '',
        tipAciklama: item.subject  || '',
        sirket:      item.title    || '',
        kodlar:      sirketKodlari(item.title),
        ozet:        item.summary  || '',
        url: item.disclosureIndex
          ? 'https://www.kap.org.tr/tr/Bildirim/' + item.disclosureIndex
          : '',
      }));

    return res.status(200).json({ bildirimler });
  } catch (e) {
    return res.status(200).json({ error: 'KAP fetch hatası: ' + e.message, bildirimler: [] });
  }
}
