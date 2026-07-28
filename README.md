# 🐱 Zıplayan Kedicik

İki boyutlu, dokunmatik kontrollü platform oyunu. 10 bölüm, engeller, "?" kutularından
çıkan ateş gücüyle 15 saniyelik yenilmezlik. Saf HTML/CSS/JS ile yazıldı (hiçbir dış
kütüphane yok) — bu yüzden GitHub Pages'te barındırılıp PWABuilder ile doğrudan APK'ya
çevrilebilir.

## Dosyalar
- `index.html` — oyun ekranı ve butonlar
- `style.css` — görünüm
- `game.js` — tüm oyun mantığı (fizik, çizim, bölümler, kayıt)
- `manifest.json` — PWA tanımı (APK çevirimi için gerekli)
- `service-worker.js` — çevrimdışı çalışma için önbellekleme
- `icons/` — uygulama ikonları (192px, 512px)

## 1) GitHub'a yükleme
```bash
git init
git add .
git commit -m "Zıplayan Kedicik ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/kedicik-oyunu.git
git push -u origin main
```

## 2) GitHub Pages ile yayınlama (PWABuilder buradan okuyacak)
- GitHub'da repo → **Settings → Pages**
- "Branch: main / (root)" seçip kaydet
- Birkaç dakika sonra oyun şu adreste yayında olur:
  `https://KULLANICI_ADIN.github.io/kedicik-oyunu/`
- Bu adresi tarayıcıda açıp oyunun çalıştığını doğrula.

## 3) PWABuilder ile APK'ya çevirme
1. https://www.pwabuilder.com adresine git.
2. GitHub Pages adresini (`https://KULLANICI_ADIN.github.io/kedicik-oyunu/`) kutuya yapıştır, **Start**.
3. PWABuilder `manifest.json` ve `service-worker.js`'i otomatik bulacak; "Manifest" ve
   "Service Worker" testleri yeşile dönmeli.
4. **Package for Store → Android** sekmesine geç.
5. Paket adı (örn. `com.senin.kedicik`), sürüm no vb. doldur, **Generate** de.
6. İnen `.zip` içinden **.apk** (veya `.aab`) dosyasını çıkar, telefona kurup test et.

> Not: Android paketi imzalamak (Play Store'a yüklemek) için PWABuilder sana bir
> keystore dosyası da verir — bunu güvenli bir yerde sakla, güncellemelerde tekrar lazım olur.

## Oyun tasarım notları
- **Kontroller:** Sol altta ▶ İLERİ (basılı tutunca kedicik koşar), sağ altta ⤴ ZIPLA.
- **Süper güç:** "?" kutusuna dokununca içinden ateş çıkar; ateşe dokununca kedicik
  15 saniyeliğine kırmızıya döner ve bu sürede engellere çarpsa bile yanmaz (engelleri dağıtır).
  Süre bitince güç gider; yeni bir güç almak için başka bir "?" kutusuna ulaşman gerekir.
- **Bölümler:** Toplam 10 bölüm, her biri öncekinden biraz daha uzun ve engelleri daha sık.
  Bölüm uzunlukları ortalama bir oyuncunun ~2 dakikada bitirebileceği şekilde ayarlandı;
  kesin süre oyuncunun hızına göre değişir.
- **İlerleme kaydı:** Tarayıcının `localStorage`'ında saklanır — oyunu kapatıp açsan bile
  hangi bölümde kaldığın ve hangi bölümlerin açık olduğu korunur.
- **Ölüm/tekrar deneme:** Güçsüzken bir engele çarparsan "Tekrar Dene" ekranı çıkar ve
  aynı bölüm baştan başlar (bölümler sabit tohumla üretildiği için her denemede aynıdır).

## Kolayca özelleştirme
- Renkler: `style.css` en üstteki `:root` değişkenleri.
- Zorluk/uzunluk: `game.js` içinde `generateLevel()` fonksiyonu.
- Kedicik çizimi: `game.js` içinde `drawCat()` fonksiyonu (canvas şekilleriyle çizilir,
  görsel dosyası kullanmaz — istersen kendi PNG sprite'ını da kolayca entegre edebilirsin).
