/* Statik fayllar: lokal server va Netlify yigʻuvchisi (scripts/build.js) uchun bitta roʻyxat. */
export const VENDOR = [
  ['/vendor/face/', '@vladmandic/face-api/dist'],
  ['/vendor/model/', '@vladmandic/face-api/model'],
  ['/vendor/wasm/', '@tensorflow/tfjs-backend-wasm/dist'],
  ['/vendor/onest/', '@fontsource-variable/onest/files'],
];
/** Sayt haqiqatan ishlatadigan fayllar; Netlify ga faqat shular chiqadi. */
export const USED = [
  /^face-api\.esm\.js$/, /^(ssd_mobilenetv1|face_landmark_68|face_recognition)_model/, /^tfjs-backend-wasm.*\.wasm$/, /^onest-(latin|latin-ext|cyrillic)-wght-normal\.woff2$/,
];
export const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; media-src 'self' blob:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
