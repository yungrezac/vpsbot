require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Rcon } = require('rcon-client');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- БАЗА ДАННЫХ ИГРОКОВ (JSON ФАЙЛ) ---
// В Railway не забудьте добавить Volume к папке с проектом, 
// чтобы файл users.json не стирался при перезапусках!
const DB_FILE = process.env.DB_PATH || './users.json';
let users = {};
if (fs.existsSync(DB_FILE)) {
    users = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveUsers() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

const pendingLinks = new Map();

// --- НАСТРОЙКА TELEGRAM БОТА ---
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('start', (ctx) => {
    const chatId = ctx.chat.id;
    if (users[chatId]) {
        sendMainMenu(ctx);
    } else {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        pendingLinks.set(code, chatId);
        ctx.reply(`👋 Привет! Для привязки аккаунта Minecraft зайдите на сервер и введите команду:\n\n\`/link ${code}\``, { parse_mode: 'Markdown' });
    }
});

function sendMainMenu(ctx) {
    const user = users[ctx.chat.id];
    ctx.reply(`🖥 Личный кабинет: *${user.name}*\n\nВыберите действие:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💎 Купить VIP (199 ⭐️)', 'buy_vip')],
            [Markup.button.callback('💵 Купить $50,000 (100 ⭐️)', 'buy_money')],
            [Markup.button.callback('🔮 Купить Прогрузчик (300 ⭐️)', 'buy_loader')]
        ])
    });
}

bot.action('buy_vip', (ctx) => {
    ctx.replyWithInvoice({
        title: 'VIP Статус',
        description: 'VIP на 30 дней + VIP Шалкер + $10,000',
        payload: 'vip_1mo',
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: 'Цена', amount: 199 }]
    });
});

bot.action('buy_money', (ctx) => {
    ctx.replyWithInvoice({
        title: 'Игровая валюта',
        description: 'Пополнение баланса на $50,000',
        payload: 'money_50000',
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: 'Цена', amount: 100 }]
    });
});

bot.action('buy_loader', (ctx) => {
    ctx.replyWithInvoice({
        title: 'Прогрузчик Чанка',
        description: 'Блок, с которым ферма работает 24/7',
        payload: 'item_loader',
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: 'Цена', amount: 300 }]
    });
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    const chatId = ctx.chat.id;
    const user = users[chatId];

    try {
        if (payload === 'vip_1mo') {
            await executeRcon(`givevip ${user.name}`);
            ctx.reply('✅ Оплата прошла! VIP статус выдан на сервере.');
        } else if (payload === 'money_50000') {
            await executeRcon(`eco give ${user.name} 50000`);
            ctx.reply('✅ Баланс пополнен на $50,000!');
        } else if (payload === 'item_loader') {
            await executeRcon(`giveloader ${user.name}`);
            ctx.reply('✅ Прогрузчик чанка выдан вам на сервере!');
        }
    } catch (err) {
        console.error('Ошибка RCON:', err);
        ctx.reply('⚠️ Оплата прошла, но сервер Minecraft сейчас недоступен. Администратор выдаст товар вручную!');
    }
});

bot.launch();

// --- ВЫПОЛНЕНИЕ КОМАНД НА СЕРВЕРЕ (RCON) ---
async function executeRcon(command) {
    const rcon = await Rcon.connect({
        host: process.env.RCON_HOST,
        port: parseInt(process.env.RCON_PORT),
        password: process.env.RCON_PASSWORD
    });
    await rcon.send(command);
    await rcon.end();
}

// --- EXPRESS API (ДЛЯ ПРИЕМА ЗАПРОСОВ ОТ МАЙНКРАФТА) ---
app.post('/api/link', (req, res) => {
    const { code, uuid, name } = req.body;
    
    // Проверка секретного ключа
    if (req.headers.authorization !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const chatId = pendingLinks.get(code);
    if (chatId) {
        users[chatId] = { uuid, name };
        saveUsers();
        pendingLinks.delete(code);
        
        bot.telegram.sendMessage(chatId, `✅ Аккаунт **${name}** успешно привязан! Напишите /start для входа в меню.`, { parse_mode: 'Markdown' });
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid code' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API работает на порту ${PORT}`));
