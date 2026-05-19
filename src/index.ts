import { Telegraf } from 'telegraf';
import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import { getTopDecks, screenshotDeckPage, closeBrowser } from './topDecks.js';
import { suggestionsManager, Suggestion } from './suggestions.js';

import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const SCREENSHOTS_DIR = path.join('/tmp', 'screenshots');
const HISTORY_FILE = '/tmp/history.txt';
const DATA_DIR = '/tmp/data';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN não encontrado no arquivo .env');
}

const bot = new Telegraf(BOT_TOKEN);

class DeckBotLogger {
  static info(message: string, ...args: any[]) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  }

  static error(message: string, error?: any) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }
}

async function ensureDirectories() {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    const suggestionsFile = path.join(DATA_DIR, 'suggestions.json');
    const ideasFile = path.join(DATA_DIR, 'ideas.md');
    
    try {
      await fs.access(suggestionsFile);
    } catch {
      await fs.writeFile(suggestionsFile, '[]');
    }
    
    try {
      await fs.access(ideasFile);
    } catch {
      await fs.writeFile(ideasFile, '# Ideias do Bot\n\n');
    }
    
  } catch (error) {
    DeckBotLogger.error('Erro ao criar diretórios', error);
  }
}

async function generatePDF(imagePaths: string[]): Promise<string> {
  const pdfPath = path.join(SCREENSHOTS_DIR, `top_decks_${Date.now()}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const pdfStream = fsSync.createWriteStream(pdfPath);

  return new Promise((resolve, reject) => {
    doc.pipe(pdfStream);
    imagePaths.forEach((imgPath, index) => {
      doc.addPage({ size: 'A4' });
      doc.image(imgPath, 50, 50, { width: 500, fit: [500, 700] });
      if (index === 0) {
        doc.fontSize(16).text('Top Decks - Limitless', 50, 30);
      }
    });
    doc.end();
    pdfStream.on('finish', () => resolve(pdfPath));
    pdfStream.on('error', reject);
  });
}

async function cleanupFiles(filePaths: string[]) {
  try {
    await Promise.all(filePaths.map(filePath => fs.unlink(filePath).catch(() => {})));
  } catch (error) {
    DeckBotLogger.error('Erro ao limpar arquivos temporários', error);
  }
}

// Comandos do bot (mesmos do seu código original)
bot.start((ctx) => {
  ctx.reply('🎴 Olá! Sou o PokéDeck Bot!\n\n📊 Use /topdecks para ver os melhores decks do momento\n💡 Use /suggest para enviar sugestões\n📋 Use /help para ver todos os comandos');
});

bot.help((ctx) => {
  ctx.reply(`
🤖 **Comandos disponíveis:**
/topdecks - Busca os top 3 decks do Limitless
/suggest - Envie sua ideia ou sugestão
/vote [ID] - Vote nas melhores sugestões
/topsuggestions - Veja as sugestões mais votadas
/roadmap - Veja o roadmap do projeto
/help - Mostra esta mensagem de ajuda
  `.trim());
});

bot.command('suggest', async (ctx) => {
  // ... seu código existente
  await ctx.reply('⚠️ Sistema de sugestões em implementação no Vercel. Use no modo local por enquanto.');
});

bot.command('topdecks', async (ctx) => {
  const userId = ctx.from?.id;
  DeckBotLogger.info(`Comando /topdecks recebido do usuário ${userId}`);

  try {
    await ctx.reply('⏳ Buscando os top decks do Limitless...');
    await ensureDirectories();

    const decks = await getTopDecks(3);
    
    if (!decks || decks.length === 0) {
      await ctx.reply('❌ Nenhum deck encontrado no momento.');
      return;
    }

    for (let i = 0; i < decks.length; i++) {
      const deck = decks[i];
      if (!deck) continue;

      try {
        const fileName = `deck_${Date.now()}_${i + 1}.png`;
        const screenshotPath = await screenshotDeckPage(deck.url, fileName);
        
        const caption = `🏆 **Deck ${i + 1}:** ${deck.title}\n\n📊 **Posição:** ${deck.position || 'N/A'}\n👤 **Jogador:** ${deck.player || 'Não informado'}`;
        
        await ctx.replyWithPhoto({ source: screenshotPath }, { caption, parse_mode: 'Markdown' as const });
        await cleanupFiles([screenshotPath]);
        
      } catch (deckError) {
        DeckBotLogger.error(`Erro ao processar deck ${i + 1}`, deckError);
        await ctx.reply(`⚠️ Erro ao processar o deck ${i + 1}.`);
      }
    }

    await ctx.reply('✅ Busca concluída com sucesso!');

  } catch (error) {
    DeckBotLogger.error('Erro geral no comando topdecks', error);
    await ctx.reply('❌ Ocorreu um erro inesperado. Tente novamente mais tarde.');
  }
});

// Função principal para Vercel
export default async function handler(req: any, res: any) {
  try {
    await ensureDirectories();
    
    // Configurar webhook
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
      res.status(200).json({ ok: true });
    } else {
      res.status(200).json({ 
        message: 'PokéDeck Bot is running!',
        commands: ['/topdecks', '/suggest', '/vote', '/topsuggestions', '/roadmap', '/help']
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  bot.launch();
  console.log('Bot rodando em modo de desenvolvimento...');
}