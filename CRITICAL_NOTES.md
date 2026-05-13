# HisseMatik — Kritik Notlar & Geçmiş Hatalar

Bu dosyayı her AI konuşmasının başında paylaş.
"Bunları değiştirme" listesidir.

---

## ⚠️ ASLA DEĞİŞTİRİLMEMESİ GEREKENLER

### 1. BIST Endeks Sembolleri
- ❌ `^XU100` → Yahoo'da BOZUK. 2019'dan beri stale data (101.729, %0.00) döner.
- ❌ `^XU030` → Aynı sorun.
- ✅ `XU100.IS` → Doğru, güncel veri gelir (~14.000-15.000 puan arası)
- ✅ `XU030.IS` → Doğru

**Hem `worker.js` hem `app.js`'de tutarlı olmalı:**
- `worker.js` → semboller listesinde `XU100.IS`, `XU030.IS`
- `app.js` → `data['XU100.IS']`, `data['XU030.IS']`

### 2. Yahoo Finance % Değişim Hesabı
- `chartPreviousClose` → endeks sembollerinde güvenilmez, bazen null/0 gelir
- ✅ `regularMarketChangePercent` → Yahoo'nun kendi hesabı, önce bunu kullan
- Fallback zinciri: `chartPreviousClose` → `regularMarketPreviousClose` → `previousClose` → `close[-2]`

### 3. Mimari Kurallar (Bozulursa Her Şey Karışır)
- `ui.js` → sadece state okur, API çağrısı YAPMAZ
- `api.js` → DOM'a DOKUNMAZ
- `app.js` → orkestrasyon, tüm event'ler burada bağlı
- `state.js` → tüm global değişkenler burada yaşar
- HTML'de `onclick` YOK, tüm event'ler `DOMContentLoaded`'da bağlı

---

## 📋 ÇÖZÜLMÜŞ HATALAR (Tekrar Açılmasın)

| Tarih | Sorun | Çözüm |
|-------|-------|-------|
| Mayıs 2026 | BIST 100/30 yanlış değer (101.729) | `^XU100` → `XU100.IS`, `^XU030` → `XU030.IS` |
| Mayıs 2026 | Değişim %0.00 çıkıyor | `regularMarketChangePercent` öncelikli kullan |

---

## 🏗️ STACK

- Vanilla JS ES modules
- Firebase 10 (auth + Firestore)
- Claude Sonnet API
- Yahoo Finance proxy (Cloudflare Worker)
- GitHub Pages deploy

## 📡 PROXY

- URL: `https://hissematik-proxy.ugurserkan.workers.dev`
- `?piyasa=1` → endeks + döviz + altın
- `?sembol=GARAN.IS` → tekil hisse geçmişi
- `?tumfiyatlar=1` → BIST30 anlık fiyatlar
- `?haberler=1` → RSS haberleri
- `?kap=1` → KAP bildirimleri
