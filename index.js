const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

const TOKEN = process.env.Kodi_Token

// Базы данных
const FIX_FILE = './fixDB.json';
const CODE_FILE = './codeDB.json';
const HELP_FILE = './helpDB.json';

let fixDB = {}, codeDB = {}, helpDB = {};

if (fs.existsSync(FIX_FILE)) fixDB = JSON.parse(fs.readFileSync(FIX_FILE));
if (fs.existsSync(CODE_FILE)) codeDB = JSON.parse(fs.readFileSync(CODE_FILE));
if (fs.existsSync(HELP_FILE)) helpDB = JSON.parse(fs.readFileSync(HELP_FILE));

function saveFixDB() { fs.writeFileSync(FIX_FILE, JSON.stringify(fixDB, null, 2)); }
function saveCodeDB() { fs.writeFileSync(CODE_FILE, JSON.stringify(codeDB, null, 2)); }
function saveHelpDB() { fs.writeFileSync(HELP_FILE, JSON.stringify(helpDB, null, 2)); }

// Защита от спама
const spamCooldown = new Map();

// Функция отправки в лог-канал
async function sendToLogChannel(content, userTag, type) {
    const channel = client.channels.cache.get('1514978150281642094');
    if (channel) {
        await channel.send(`📌 [${type}] от ${userTag}:\n${content}`);
    }
}

client.once('ready', () => {
    console.log(`✅ Коди запущен: ${client.user.tag}`);
    client.user.setActivity('!help | учусь', { type: 0 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Антиспам
    const now = Date.now();
    if (!spamCooldown.has(message.author.id)) spamCooldown.set(message.author.id, []);
    const timestamps = spamCooldown.get(message.author.id).filter(t => now - t < 5000);
    if (timestamps.length >= 4) {
        message.reply('❌ Не спамь, я не успеваю!');
        return;
    }
    timestamps.push(now);
    spamCooldown.set(message.author.id, timestamps);

    const content = message.content;

    // ===== КОМАНДА !Коди =====
    if (content.startsWith('!Коди Кто ')) {
        const userMessage = content.slice(10).trim();
        if (!userMessage) {
            message.reply('❌ Напиши что-нибудь после `!Коди Кто`, например: `!Коди Кто гей`');
            return;
        }
        const channel = message.channel;
        if (!channel.isTextBased()) return;
        try {
            const members = await channel.members.fetch();
            const memberList = Array.from(members.values()).filter(m => !m.user.bot);
            if (memberList.length === 0) {
                message.reply('❌ В этом канале нет других пользователей (кроме ботов).');
                return;
            }
            const randomMember = memberList[Math.floor(Math.random() * memberList.length)];
            message.reply(`Я думаю, ${randomMember.user.username} ${userMessage}`);
        } catch (err) {
            console.error(err);
            message.reply('❌ Не могу получить список участников канала. Проверь права бота.');
        }
        return;
    }

    // ===== 1. ОБУЧЕНИЕ ОШИБКАМ =====
    if (content.startsWith('!Fix ')) {
        const match = content.match(/^!Fix \((.*?)\) \/ \((.*?)\)$/);
        if (!match) {
            message.reply('❌ Формат: `!Fix (ошибка) / (решение)`');
            return;
        }
        const error = match[1];
        const solution = match[2];
        fixDB[error] = solution;
        saveFixDB();
        message.reply(`✅ Запомнил ошибку: ${error}\n🔧 Решение: ${solution}`);
        return;
    }

    // ===== 2. ПОИСК ОШИБКИ =====
    if (content.startsWith('!FixH ')) {
        const error = content.slice(6).trim();
        const solution = fixDB[error];
        if (solution) {
            message.reply(`🔧 Ошибка: ${error}\n✅ Решение: ${solution}`);
        } else {
            message.reply(`❌ Хз ща посмотрим: "${error}". Добавь: !Fix (${error}) / (решение)`);
            sendToLogChannel(error, message.author.tag, 'Неизвестная ошибка');
        }
        return;
    }

    // ===== 3. УЧУ КОД =====
    if (content.startsWith('!учи ')) {
        const matchLang = content.match(/^!учи (\w+) \((.*?)\) %(.*?)%$/);
        if (matchLang) {
            const lang = matchLang[1];
            const code = matchLang[2];
            const explanation = matchLang[3];
            if (!codeDB[lang]) codeDB[lang] = [];
            codeDB[lang].push({ code, explanation });
            saveCodeDB();
            message.reply(`✅ Запомнил код для ${lang}\n📘 ${explanation}`);
            return;
        }
    }

    // ===== 4. УЧУ ОТВЕТЫ НА ВОПРОСЫ =====
    if (content.startsWith('!учи ')) {
        const matchHelp = content.match(/^!учи \((.*?)\) %(.*?)%$/);
        if (matchHelp) {
            const question = matchHelp[1];
            const answer = matchHelp[2];
            helpDB[question] = answer;
            saveHelpDB();
            message.reply(`✅ Запомнил ответ на вопрос:\n❓ ${question}\n📘 ${answer}`);
            return;
        }
    }

    // ===== 5. ПОКАЗАТЬ КОД =====
    if (content.startsWith('!код ')) {
        const lang = content.slice(5).trim();
        const entries = codeDB[lang];
        if (entries && entries.length) {
            let reply = `📚 **Примеры кода для ${lang}:**\n`;
            entries.forEach((e, i) => {
                reply += `\n**${i+1}** \`${e.code}\`\n📘 ${e.explanation}\n`;
            });
            message.reply(reply);
        } else {
            message.reply(`❌ Нет примеров для ${lang}. Добавь: \`!учи ${lang} (код) %объяснение%\``);
        }
        return;
    }

    // ===== 6. УМНЫЙ ПОИСК ПО ВОПРОСАМ =====
    if (content.startsWith('!помощь ')) {
        const question = content.slice(8).trim().toLowerCase();
        let bestMatch = null;
        let bestScore = 0;
        for (const [storedQuestion, answer] of Object.entries(helpDB)) {
            let score = 0;
            const words = question.split(/\s+/);
            for (const word of words) {
                if (word.length > 2 && storedQuestion.toLowerCase().includes(word)) score++;
            }
            if (storedQuestion.toLowerCase().startsWith(question.slice(0, 10))) score += 5;
            if (score > bestScore && score > 0) {
                bestScore = score;
                bestMatch = { question: storedQuestion, answer };
            }
        }
        if (bestMatch) {
            message.reply(`❓ **Вопрос:** ${bestMatch.question}\n✅ **Ответ:** ${bestMatch.answer}`);
        } else {
            message.reply(`❌ Хз ща посмотрим: "${question}". Научи меня: \`!учи (${question}) %ответ%\``);
            sendToLogChannel(question, message.author.tag, 'Неизвестный вопрос');
        }
        return;
    }

    // ===== 7. СПРАВКА =====
    if (content === '!help') {
        message.reply(`
📖 **Коди — команды**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❓ !Fix (ошибка) / (решение) — научить бота ошибкам
🔍 !FixH (ошибка) — найти решение ошибки
🧠 !учи lua (код) %объяснение% — выучить код
📚 !код lua — показать выученный код
📘 !учи (вопрос) %ответ% — выучить ответ для помощи
❓ !помощь (вопрос) — поиск по выученным ответам
🏳️‍🌈 !Коди Кто (текст) — узнай кто
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `);
        return;
    }
});

client.login(TOKEN);
