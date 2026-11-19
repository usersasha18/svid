const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Загружаем .env без дополнительных зависимостей, чтобы `npm start` работал напрямую.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) process.env[key] = value.replace(/^(['\"])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ROOT = __dirname;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('PORT должен быть числом от 1 до 65535.');
  process.exit(1);
}
if (typeof fetch !== 'function') {
  console.error('Требуется Node.js 18 или новее (встроенный fetch).');
  process.exit(1);
}
if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Создайте .env по образцу .env.example и задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.');
  process.exit(1);
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/answer') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 4096) req.destroy(); });
    req.on('end', async () => {
      try {
        const { answer, plans = [], dateTime = '' } = JSON.parse(raw || '{}');
        const labels = { yes: 'Ответ: ДА 💜', no: 'Ответ: НЕТ 🙈' };
        const validDateTime = typeof dateTime === 'string' && /^\d{4}-\d{2}-\d{2}T(?:18|19|20|21|22|23):[0-5]\d$/.test(dateTime);
        const selectedDate = validDateTime ? new Date(`${dateTime.slice(0, 10)}T00:00:00Z`) : null;
        const validSunday = selectedDate && !Number.isNaN(selectedDate.getTime()) && selectedDate.toISOString().slice(0, 10) === dateTime.slice(0, 10) && selectedDate.getUTCDay() === 0;
        if (!labels[answer] || !Array.isArray(plans) || plans.length > 3 || plans.some(plan => typeof plan !== 'string' || plan.length > 100) || (answer === 'yes' && !validSunday) || (dateTime && !validSunday)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Некорректный ответ, дата или выбор свидания' }));
        }
        const dateText = validSunday ? `\nВремя: ${new Date(`${dateTime}:00+10:00`).toLocaleString('ru-RU', { timeZone: 'Asia/Vladivostok', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} (Владивосток)` : '';
        const planText = plans.length ? `\nПланы: ${plans.join(', ')}` : '';
        const telegram = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: `${labels[answer]}\nПриглашение на свидание${dateText}${planText}` })
        });
        const result = await telegram.json();
        if (!telegram.ok || !result.ok) throw new Error(result.description || 'Telegram API error');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('Не удалось отправить ответ в Telegram:', error.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Не удалось отправить уведомление' }));
      }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end('Method Not Allowed');
  }
  const requested = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not Found');
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, () => console.log(`Сайт доступен: http://localhost:${PORT}`));
