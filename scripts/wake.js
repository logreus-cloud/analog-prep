// Бесплатные инстансы засыпают после ~15 минут простоя, и первый запрос
// после сна идёт полминуты. Запускать за пару минут до показа.
//   BASE_URL=https://ваш-сервис.onrender.com npm run wake
import { BASE } from './_base.js';

const started = Date.now();
const res = await fetch(BASE + '/api/health');
const data = await res.json();
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`${BASE} -> ${res.status} за ${seconds}s`);
console.log(`commit=${data.commit}  demoMode=${data.demoMode}  uptime=${data.uptimeSec}s`);
if (Number(seconds) > 5) console.log('\nИнстанс просыпался. Теперь он прогрет — показывайте.');
