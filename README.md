# HISCHOOL

Oʻquvchi, oʻqituvchi va ota-onani bitta tizimga birlashtiradigan ingliz tili taʼlim platformasi. Brauzerda ishlaydi: kompyuter, planshet va telefonda. Tillar: oʻzbek, ingliz, rus.

## Ishga tushirish

1. [Node.js](https://nodejs.org) 22.13 yoki yangiroq versiyasi kerak.
2. `start.bat` faylini oching (yoki `npm install && npm start`). Manzil: http://localhost:3000
3. Birinchi ishga tushganda oynada **admin login-paroli** va oʻqituvchilar uchun **maktab kodi** chiqadi. Admin paroli faqat bir marta koʻrsatiladi.

Namuna maʼlumotlar bilan koʻrish: `demo.bat` (yoki `npm run demo`), http://localhost:3100

| Rol | Login | Parol |
| --- | --- | --- |
| Admin | `DEMO-A` | `demo-demo` |
| Oʻqituvchi | `DEMO-T` | `demo-demo` |
| Ota-ona | `DEMO-P` | `demo-demo` |
| Oʻquvchi | `DEMO-S` | `demo-demo` |

Namuna rejimi faqat shu kompyuterda ochiladi.

## Rollar

- **Admin:** oʻquvchi, ota-ona, oʻqituvchi, sinf, xona, kamera, jadval, davomat, baho, intizom, vazifa va xabarlarni boshqaradi.
- **Oʻqituvchi:** oʻz sinflari, jurnal, testlar, vazifalar, fikrlar, jonli dars.
- **Ota-ona:** faqat tasdiqlangan farzandining maʼlumoti va sinf kamerasi.
- **Oʻquvchi:** faqat oʻz natijalari.

## Tartib

1. Admin xonalarni qoʻshadi, oʻqituvchiga maktab kodini beradi.
2. Oʻqituvchi roʻyxatdan oʻtadi va sinf ochadi.
3. Oʻquvchi (rasmi bilan) va ota-ona roʻyxatdan oʻtadi.
4. Oʻqituvchi yoki admin ularni tasdiqlaydi. Tasdiqsiz maʼlumot ham, kamera ham ochilmaydi.
5. Oʻqituvchi «Jonli dars» boʻlimida darsni boshlaydi.

## Kamera

- Kompyuterga ulangan yoki USB kamera ishlaydi. IP (RTSP) kamerani OBS kabi dastur orqali virtual kamera qilib ulang.
- Ota-onaga faqat oʻz farzandining yuzi ochiq boradi, boshqa yuzlar xiralashtiriladi. Yuz aniqlanmagan kadrda xiralashtirish ishlamasligi mumkin.
- Ovoz oʻqituvchi yoqsagina uzatiladi. Video ham, ovoz ham saqlanmaydi.
- Tanish va «diqqat» foizi taxminiy. Davomatni jurnalda tekshiring. Kamerani doska yoniga qoʻying.

## Internetga joylashtirish

Uydan kirish uchun HTTPS server kerak (kamera ham faqat `localhost` yoki HTTPS da ochiladi):

- proksi (Caddy, nginx) orqasida: `TRUST_PROXY=1`, `HOST=127.0.0.1`; proksi WebSocket (`/live`) ni ham oʻtkazsin;
- yoki sertifikatni `certs/cert.pem` va `certs/key.pem` ga qoʻying.

Maʼlumotlar bazasi va rasmlar diskda (`data/`) saqlanadi, shuning uchun doimiy diskli server kerak. Sozlamalar: `PORT`, `HOST`, `HS_DATA`, `TRUST_PROXY`.

## Xavfsizlik

- Parollar scrypt bilan xeshlanadi, kirish urinishlari cheklanadi.
- Sessiya HttpOnly cookie orqali; faol qurilmalar sozlamalarda koʻrinadi va chiqariladi.
- Har bir soʻrovda rol va egalik serverda tekshiriladi. Kamera ruxsatini ota-ona yoki xona boʻyicha yopish mumkin, koʻrishlar qayd etiladi.
- `data/` va `certs/` Git ga tushmaydi. Bolalar rasmi uchun ota-onadan yozma rozilik oling.

Parolni unutgan admin yoki oʻqituvchi uchun: `npm run reset-password -- HS-ADMIN`

## Texnologiya

Node.js (`node:http`, `node:sqlite`), WebSocket (`ws`), oddiy JavaScript modullari. Yuzni tanish: `@vladmandic/face-api`, brauzerning oʻzida. Shrift: Onest.
