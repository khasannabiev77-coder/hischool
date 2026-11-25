# HISCHOOL

Oʻquvchi, oʻqituvchi va ota-onani bitta tizimga birlashtiradigan ingliz tili taʼlim platformasi. Brauzerda ishlaydi: kompyuter, planshet va telefonda. Tillar: oʻzbek, ingliz, rus.

## Ishga tushirish

1. [Node.js](https://nodejs.org) 22.12 yoki yangiroq versiyasi kerak.
2. `start.bat` faylini oching (yoki `npm install && npm start`). Manzil: http://localhost:3000
3. Birinchi ishga tushganda oynada **admin login-paroli** chiqadi. U faqat bir marta koʻrsatiladi.

Namuna maʼlumotlar bilan koʻrish: `demo.bat` (yoki `npm run demo`), http://localhost:3100

| Rol | Login | Parol |
| --- | --- | --- |
| Admin | `DEMO-A` | `demo-demo` |
| Oʻqituvchi | `DEMO-T` | `demo-demo` |
| Ota-ona | `DEMO-P` | `demo-demo` |
| Oʻquvchi | `DEMO-S` | `demo-demo` |

Namuna rejimi faqat shu kompyuterda ochiladi.

## Rollar

- **Admin:** oʻquvchi, ota-ona, oʻqituvchi, guruh, xona, kamera, jadval, davomat, baho, intizom, vazifa va xabarlarni boshqaradi.
- **Oʻqituvchi:** oʻz guruhlari, jurnal, testlar, vazifalar, fikrlar, jonli dars.
- **Ota-ona:** faqat tasdiqlangan farzandining maʼlumoti va dars kamerasi.
- **Oʻquvchi:** faqat oʻz natijalari.

## Tartib

1. Oʻqituvchi, oʻquvchi (rasmi bilan) va ota-ona roʻyxatdan oʻtadi. Kod ham, guruh ham soʻralmaydi.
2. Soʻrov administratorga boradi. **Soʻrovlar** boʻlimida u tasdiqlaydi: oʻquvchiga guruh va daraja beradi, ota-onani farzandiga bogʻlaydi.
3. Tasdiqlanguncha hech kim ilovaga kira olmaydi, faqat kutish sahifasini koʻradi.
4. Guruhni oʻqituvchi (Sozlamalar) yoki administrator (Guruhlar) ochadi. Xonalarni administrator qoʻshadi.
5. Oʻqituvchi «Jonli dars» boʻlimida darsni boshlaydi.

## Kamera

- Kompyuterga ulangan yoki USB kamera ishlaydi. IP (RTSP) kamerani OBS kabi dastur orqali virtual kamera qilib ulang.
- Ota-onaga faqat oʻz farzandining yuzi ochiq boradi, boshqa yuzlar xiralashtiriladi. Yuz aniqlanmagan kadrda xiralashtirish ishlamasligi mumkin.
- Ovoz oʻqituvchi yoqsagina uzatiladi. Serverda faqat eng oxirgi kadr turadi (ovozning oxirgi 6 soniyasi bilan), dars tugagach oʻchadi.
- Tanish va «diqqat» foizi taxminiy. Davomatni jurnalda tekshiring. Kamerani doska yoniga qoʻying.

## Vercel ga joylashtirish

Sozlamalar `vercel.json` da. Kerak: Postgres (Vercel Marketplace dagi Neon, bepul) va `ADMIN_PASSWORD`.

```
npx vercel link
npx vercel install neon
npx vercel env add ADMIN_PASSWORD production
npx vercel deploy --prod
```

Neon `DATABASE_URL` ni oʻzi qoʻshadi. Rasmlar ham, jonli darsning oxirgi kadri ham Postgres da turadi (kadrlar jadvali jurnalsiz, zaxiraga tushmaydi). Saytga `HS-ADMIN` bilan kirasiz.

Bepul Hobby rejasi Vercel qoidasiga koʻra shaxsiy, notijorat loyihalar uchun. Pullik toʻgarak uchun Pro reja kerak.

## Netlify ga joylashtirish

1. [app.netlify.com](https://app.netlify.com) da **Add new project → Import from GitHub** orqali shu repozitoriyni tanlang. Sozlamalar `netlify.toml` dan olinadi.
2. **Project configuration → Environment variables** boʻlimida `ADMIN_PASSWORD` qoʻshing (kamida 8 belgi, kichik harflar).
3. **Deploy** qiling. Netlify Database (Postgres) va Blobs oʻzi yaratiladi, jadvallar birinchi ochilishda tuziladi.
4. Saytga `HS-ADMIN` va oʻzingiz kiritgan parol bilan kiring. Parolni **Sozlamalar** da almashtiring.

Boshqa Postgres (Neon, Supabase) ishlatmoqchi boʻlsangiz, `DATABASE_URL` ni kiriting, u Netlify Database dan ustun turadi.

| Oʻzgaruvchi | Vazifasi |
| --- | --- |
| `ADMIN_PASSWORD` | Birinchi admin paroli (Netlify da majburiy) |
| `DATABASE_URL` | Boshqa Postgres (ixtiyoriy) |
| `HS_TZ` | Toʻgarak vaqt mintaqasi, odatda `Asia/Tashkent` |

Netlify da bilish kerak:

- Netlify Database faqat kreditli rejalarda bor (2025-yil sentabrdan keyingi yangi akkauntlarda standart, bepul reja ham kiradi).
- WebSocket yoʻq: bildirishnomalar 45 soniyada bir, jonli kadr 1–2 soniyada bir yangilanadi. Lokal serverda tezroq.
- Jonli dars trafik sarflaydi: bitta ota-ona uchun soatiga taxminan 100 MB. Hech kim koʻrmayotganda kadr yuborilmaydi. Katta toʻgarak uchun bepul reja yetmasligi mumkin.

## Oʻz serveringiz

HTTPS kerak (kamera faqat `localhost` yoki HTTPS da ochiladi): proksi orqasida `TRUST_PROXY=1` va `HOST=127.0.0.1`, yoki sertifikatni `certs/cert.pem` va `certs/key.pem` ga qoʻying. Sozlamalar: `PORT`, `HOST`, `HS_DATA`, `DATABASE_URL`.

## Xavfsizlik

- Parollar scrypt bilan xeshlanadi, kirish urinishlari cheklanadi.
- Sessiya HttpOnly cookie orqali; faol qurilmalar sozlamalarda koʻrinadi va chiqariladi.
- Har bir soʻrovda rol va egalik serverda tekshiriladi. Kamera ruxsatini ota-ona yoki xona boʻyicha yopish mumkin, koʻrishlar qayd etiladi.
- Lokal maʼlumot (`data/`) va `certs/` Git ga tushmaydi. Bolalar rasmi uchun ota-onadan yozma rozilik oling.

Parolni unutgan admin yoki oʻqituvchi uchun: `npm run reset-password -- HS-ADMIN`

## Texnologiya

Node.js, Postgres (lokalda PGlite), Netlify Functions va Blobs, oddiy JavaScript modullari. Yuzni tanish: `@vladmandic/face-api`, brauzerning oʻzida. Shrift: Onest.
