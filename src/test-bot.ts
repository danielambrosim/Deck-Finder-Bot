import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN não encontrado no .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Testa se o token é válido
bot.telegram.getMe()
  .then((botInfo) => {
    console.log('✅ Bot conectado com sucesso!');
    console.log(`Nome do bot: @${botInfo.username}`);
    console.log(`ID: ${botInfo.id}`);
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar com o Telegram:');
    console.error(err.message);
    process.exit(1);
  });

bot.start((ctx) => {
  ctx.reply('Bot está funcionando! 🎉');
});

bot.launch()
  .then(() => {
    console.log('Bot iniciado. Pressione Ctrl+C para parar.');
  })
  .catch((err) => {
    console.error('Erro ao iniciar bot:', err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));