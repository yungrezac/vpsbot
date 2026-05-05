// Путь: index.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Rcon } = require('rcon-client');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- БАЗА ДАННЫХ ИГРОКОВ (JSON ФАЙЛ) ---
const DB_FILE = process.env.DB_PATH || './users.json';
let users = {};
if (fs.existsSync(DB_FILE)) {
    users = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveUsers() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

const pendingLinks = new Map();
const bindingStates = new Map();

// --- НАСТРОЙКА TELEGRAM БОТА ---
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('start', (ctx) => {
    const chatId = ctx.chat.id;
    if (users[chatId]) {
        sendMainMenu(ctx);
    } else {
        bindingStates.set(chatId, 'WAITING_NICK');
        ctx.reply('👋 Привет! Для доступа к магазину и личному кабинету нужно привязать аккаунт Minecraft.\n\nВведите ваш *Никнейм* (учитывая точки и пробелы, если есть):', { parse_mode: 'Markdown' });
    }
});

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    if (bindingStates.get(chatId) === 'WAITING_NICK') {
        if (text.startsWith('/')) return; // Игнорируем случайные команды
        
        const nickname = text.trim();
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        pendingLinks.set(code, { chatId, nickname });
        bindingStates.delete(chatId);

        ctx.reply(`⏳ Отлично! Ваш код подтверждения: \`${code}\`\n\nЗайдите на сервер под ником *${nickname}* и напишите: \`/link ${code}\``, { parse_mode: 'Markdown' });

        // Пытаемся отправить сообщение игроку в игру через RCON
        try {
            const msg = `{"text":"В Telegram запрошена привязка. Ваш код: ${code}\\nНапишите /link ${code} для подтверждения.","color":"yellow"}`;
            await executeRcon(`tellraw ${nickname} ${msg}`);
        } catch (e) {
            console.log(`Игрок ${nickname} оффлайн, сообщение tellraw не отправлено.`);
        }
    }
});

// --- МЕНЮ БОТА ---
function sendMainMenu(ctx) {
    const user = users[ctx.chat.id];
    ctx.reply(`🖥 Личный кабинет: *${user.name}*\n\nВыберите действие:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('👤 Профиль', 'menu_profile'), Markup.button.callback('ℹ️ О VIP', 'info_vip')],
            [Markup.button.callback('💎 Купить/Продлить VIP', 'menu_vip')],
            [Markup.button.callback('🧟 Купить Спавнеры', 'menu_spawners')],
            [Markup.button.callback('🔮 Необычные предметы', 'menu_items')],
            [Markup.button.callback('💵 Пополнить Баланс ($)', 'menu_money')]
        ])
    });
}

bot.action('menu_main', (ctx) => {
    const user = users[ctx.chat.id];
    ctx.editMessageText(`🖥 Личный кабинет: *${user.name}*\n\nВыберите действие:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('👤 Профиль', 'menu_profile'), Markup.button.callback('ℹ️ О VIP', 'info_vip')],
            [Markup.button.callback('💎 Купить/Продлить VIP', 'menu_vip')],
            [Markup.button.callback('🧟 Купить Спавнеры', 'menu_spawners')],
            [Markup.button.callback('🔮 Необычные предметы', 'menu_items')],
            [Markup.button.callback('💵 Пополнить Баланс ($)', 'menu_money')]
        ])
    });
});

bot.action('menu_profile', (ctx) => {
    const user = users[ctx.chat.id];
    const isVip = user.vipExpire && user.vipExpire > Date.now();
    const status = isVip ? "✅ VIP Активен" : "❌ Обычный игрок";
    const expire = isVip ? `\n⏳ Осталось дней: *${Math.ceil((user.vipExpire - Date.now()) / (1000 * 60 * 60 * 24))}*` : "";

    ctx.editMessageText(`👤 *Ваш Профиль*\n\nСтатус: ${status}${expire}\nНикнейм: ${user.name}\n\n📦 *VIP Шалкер*:\nКоординаты можно проверить в игре, открыв инвентарь шалкера.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'menu_main')]])
    });
});

bot.action('info_vip', (ctx) => {
    ctx.editMessageText(`ℹ️ *Преимущества VIP*:\n\n1. *Кит Набор*: Броня Незерит, Инструменты, Яблоки, Тотемы.\n2. *Приватный Шалкер*: Зона 50x50.\n3. *Сохранение вещей* при смерти.\n4. *Умный Тотем* из шалкера.\n5. Мгновенно *$10,000*.\n\nЦена: *199 Звезд* / 30 дней.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'menu_main')]])
    });
});

bot.action('menu_vip', (ctx) => {
    ctx.editMessageText(`💎 *Покупка VIP статуса*\n\nДлительность: *30 Дней*\nЦена: *199 Telegram Stars*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Оплатить 199 ⭐️', 'pay_vip')],
            [Markup.button.callback('🔙 Назад', 'menu_main')]
        ])
    });
});

bot.action('menu_spawners', (ctx) => {
    ctx.editMessageText(`🧟 *Покупка Спавнеров*\n\nЦена любого: *599 Telegram Stars*\n\nВыберите тип:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🧟 Зомби', 'pay_sp_zombie'), Markup.button.callback('💀 Скелет', 'pay_sp_skeleton')],
            [Markup.button.callback('💣 Крипер', 'pay_sp_creeper')],
            [Markup.button.callback('🔙 Назад', 'menu_main')]
        ])
    });
});

bot.action('menu_money', (ctx) => {
    ctx.editMessageText(`💵 *Пополнение баланса ($)*\n\nКурс: 100 ⭐️ = $50,000\n\nВыберите сумму:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('$25,000 (50 ⭐️)', 'pay_eco_25000'), Markup.button.callback('$50,000 (100 ⭐️)', 'pay_eco_50000')],
            [Markup.button.callback('🔙 Назад', 'menu_main')]
        ])
    });
});

bot.action('menu_items', (ctx) => {
    ctx.editMessageText(`🔮 *Необычные предметы*\n\n1. *Прогрузчик Чанка* (300 ⭐️)\nФермы работают 24/7!`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔮 Купить Прогрузчик (300 ⭐️)', 'pay_item_loader')],
            [Markup.button.callback('🔙 Назад', 'menu_main')]
        ])
    });
});

// --- ОПЛАТА И ВЫДАЧА ---
bot.action('pay_vip', (ctx) => sendInvoice(ctx, 'VIP Статус (30 Дней)', 'vip_purchase', 199));
bot.action('pay_sp_zombie', (ctx) => sendInvoice(ctx, 'Спавнер Зомби', 'spawner_ZOMBIE', 599));
bot.action('pay_sp_skeleton', (ctx) => sendInvoice(ctx, 'Спавнер Скелета', 'spawner_SKELETON', 599));
bot.action('pay_sp_creeper', (ctx) => sendInvoice(ctx, 'Спавнер Крипера', 'spawner_CREEPER', 599));
bot.action('pay_eco_25000', (ctx) => sendInvoice(ctx, '$25,000', 'eco_25000', 50));
bot.action('pay_eco_50000', (ctx) => sendInvoice(ctx, '$50,000', 'eco_50000', 100));
bot.action('pay_item_loader', (ctx) => sendInvoice(ctx, 'Прогрузчик Чанка', 'item_loader', 300));

function sendInvoice(ctx, title, payload, price) {
    ctx.replyWithInvoice({
        title: title,
        description: `Покупка товара: ${title}`,
        payload: payload,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: 'Цена', amount: price }]
    });
}

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    const chatId = ctx.chat.id;
    const user = users[chatId];

    try {
        if (payload === 'vip_purchase') {
            user.vipExpire = Date.now() + 30 * 24 * 60 * 60 * 1000;
            saveUsers();
            await executeRcon(`givevip "${user.name}"`);
            ctx.reply('✅ VIP статус успешно выдан на сервере!');
        } else if (payload.startsWith('spawner_')) {
            const type = payload.split('_')[1];
            await executeRcon(`givespawner "${user.name}" ${type}`);
            ctx.reply(`✅ Спавнер выдан вам на сервере!`);
        } else if (payload.startsWith('eco_')) {
            const amount = payload.split('_')[1];
            await executeRcon(`eco give "${user.name}" ${amount}`);
            ctx.reply(`✅ Баланс пополнен на $${amount}!`);
        } else if (payload === 'item_loader') {
            await executeRcon(`giveloader "${user.name}"`);
            ctx.reply('✅ Прогрузчик чанка выдан на сервере!');
        }
    } catch (err) {
        console.error('Ошибка RCON:', err);
        ctx.reply('⚠️ Оплата прошла, но сервер Minecraft сейчас недоступен (ошибка RCON). Товар будет выдан администратором!');
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

// --- EXPRESS API (ПРИЕМ /link ОТ МАЙНКРАФТА) ---
app.post('/api/link', (req, res) => {
    const { code, uuid, name } = req.body;
    console.log(`[API] Получен запрос на привязку. Код: ${code}, Игрок: ${name}`);
    
    if (req.headers.authorization !== process.env.API_KEY) {
        console.log(`[API] Ошибка: Неверный API_KEY!`);
        return res.status(401).json({ error: 'Unauthorized: Wrong API_KEY' });
    }

    const linkData = pendingLinks.get(code);
    if (linkData) {
        users[linkData.chatId] = { uuid, name };
        saveUsers();
        pendingLinks.delete(code);
        
        bot.telegram.sendMessage(linkData.chatId, `✅ Аккаунт *${name}* успешно привязан!`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('➡️ Открыть меню', 'menu_main')]])
        });
        res.json({ success: true });
    } else {
        console.log(`[API] Код ${code} не найден в памяти.`);
        res.status(400).json({ error: 'Invalid code' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API работает на порту ${PORT}`));
