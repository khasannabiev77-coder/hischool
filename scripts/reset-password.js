/* Parolni unutgan oʻqituvchi uchun:  npm run reset-password -- HS-1234 */
import { get, run } from '../server/db.js';
import { hash, newPassword, dropSessions } from '../server/auth.js';

const u = get('SELECT * FROM users WHERE login = ? COLLATE NOCASE', process.argv[2] || '');
if (!u) { console.error('Bunday login topilmadi. Masalan: npm run reset-password -- HS-1234'); process.exit(1); }
const password = newPassword();
run('UPDATE users SET pass = ? WHERE id = ?', hash(password), u.id);
dropSessions(u.id);
console.log(`${u.last} ${u.first}\nLogin: ${u.login}\nYangi parol: ${password}`);
