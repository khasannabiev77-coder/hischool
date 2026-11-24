/* Parolni unutgan admin yoki oʻqituvchi uchun (lokalda avval ilovani yoping):  npm run reset-password -- HS-1234 */
import { close, get, run } from '../server/db.js';
import { hash, newPassword, dropSessions } from '../server/auth.js';

const u = await get('SELECT * FROM users WHERE lower(login) = ?', (process.argv[2] || '').toLowerCase());
if (!u) { console.error('Bunday login topilmadi. Masalan: npm run reset-password -- HS-1234'); process.exit(1); }
const password = newPassword();
await run('UPDATE users SET pass = ? WHERE id = ?', hash(password), u.id);
await dropSessions(u.id);
console.log(`${u.last} ${u.first}\nLogin: ${u.login}\nYangi parol: ${password}`);
await close();
process.exit(0);
