import { Telegraf } from 'telegraf';
import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import * as fsSync from 'fs'; // Import para funções síncronas
import path from 'path';
import { getTopDecks, screenshotDeckPage } from './topDecks.js';

// Configuração
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
const HISTORY_FILE = 'history.txt';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN não encontrado no arquivo .env');
}

const bot = new Telegraf(BOT_TOKEN);

// Utilitários
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
  } catch (error) {
    DeckBotLogger.error('Erro ao criar diretório de screenshots', error);
    throw error;
  }
}

async function generatePDF(imagePaths: string[]): Promise<string> {
  const pdfPath = path.join(SCREENSHOTS_DIR, `top_decks_${Date.now()}.pdf`);
  const doc = new PDFDocument({ autoFirstPage: false });
  const pdfStream = fsSync.createWriteStream(pdfPath); // Usando fs síncrono

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
    await Promise.all(
      filePaths.map(filePath => fs.unlink(filePath))
    );
    DeckBotLogger.info(`Arquivos temporários removidos: ${filePaths.length}`);
  } catch (error) {
    DeckBotLogger.error('Erro ao limpar arquivos temporários', error);
  }
}

async function saveToHistory(decks: Array<{title: string, url: string}>) {
  try {
    const historyEntry = decks.map(deck => 
      `[${new Date().toLocaleString()}] ${deck.title} - ${deck.url}`
    ).join('\n') + '\n';

    await fs.appendFile(HISTORY_FILE, historyEntry);
  } catch (error) {
    DeckBotLogger.error('Erro ao salvar histórico', error);
  }
}

// Handlers do Bot
bot.start((ctx) => {
  DeckBotLogger.info(`Usuário ${ctx.from?.id} iniciou o bot`);
  ctx.reply('🎴 Olá! Sou o PokéDeck. Use /topdecks para ver os melhores decks.');
});

bot.help((ctx) => {
  ctx.reply(`
🤖 **Comandos disponíveis:**

/topdecks - Busca os top 3 decks do Limitless
/help - Mostra esta mensagem de ajuda

Desenvolvido com ❤️ para a comunidade Pokémon TCG
  `.trim());
});

bot.command('topdecks', async (ctx) => {
  const userId = ctx.from?.id;
  DeckBotLogger.info(`Comando /topdecks recebido do usuário ${userId}`);

  try {
    const processingMessage = await ctx.reply('⏳ Buscando os top decks do Limitless...');

    await ensureDirectories();

    DeckBotLogger.info('Buscando decks...');
    const decks = await getTopDecks(3);
    
    if (!decks || decks.length === 0) {
      await ctx.reply('❌ Nenhum deck encontrado no momento.');
      return;
    }

    const imagePaths: string[] = [];
    const tempFiles: string[] = [];

    // Processa cada deck individualmente
    for (let i = 0; i < decks.length; i++) {
      const deck = decks[i];
      if (!deck) continue; // Pula se deck for undefined

      DeckBotLogger.info(`Processando deck ${i + 1}: ${deck.title}`);

      try {
        const fileName = `deck_${Date.now()}_${i + 1}.png`;
        const screenshotPath = await screenshotDeckPage(deck.url, fileName);
        
        imagePaths.push(screenshotPath);
        tempFiles.push(screenshotPath);

        // Envia imagem com informações formatadas
        const caption = `🏆 **Deck ${i + 1}:** ${deck.title}\n\n📊 **Posição:** ${(deck as any).position || 'N/A'}\n👤 **Jogador:** ${(deck as any).player || 'Não informado'}`;
        
        await ctx.replyWithPhoto(
          { source: screenshotPath }, 
          { 
            caption,
            parse_mode: 'Markdown' as const
          }
        );

        // Pequeno delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (deckError) {
        DeckBotLogger.error(`Erro ao processar deck ${i + 1}`, deckError);
        await ctx.reply(`⚠️ Erro ao processar o deck ${i + 1}. Pulando para o próximo...`);
      }
    }

    // Gera e envia PDF
    if (imagePaths.length > 0) {
      try {
        DeckBotLogger.info('Gerando PDF...');
        const pdfPath = await generatePDF(imagePaths);
        tempFiles.push(pdfPath);

        await ctx.replyWithDocument(
          { 
            source: pdfPath, 
            filename: `top_decks_${new Date().toISOString().split('T')[0]}.pdf` 
          },
          { caption: '📋 PDF com todos os decks' }
        );

      } catch (pdfError) {
        DeckBotLogger.error('Erro ao gerar PDF', pdfError);
        await ctx.reply('⚠️ Erro ao gerar o PDF, mas as imagens foram enviadas.');
      }
    }

    // Salva histórico e limpa arquivos temporários
    await saveToHistory(decks);
    await cleanupFiles(tempFiles);

    await ctx.reply('✅ Busca concluída com sucesso!');

    // Remove mensagem de processamento
    try {
      await ctx.deleteMessage(processingMessage.message_id);
    } catch (deleteError) {
      DeckBotLogger.error('Erro ao deletar mensagem de processamento', deleteError);
    }

  } catch (error) {
    DeckBotLogger.error('Erro geral no comando topdecks', error);
    await ctx.reply('❌ Ocorreu um erro inesperado. Tente novamente mais tarde.');
  }
});

// Tratamento de erros global
bot.catch((error: any) => {
  DeckBotLogger.error('Erro global do bot', error);
});

// Graceful shutdown
process.once('SIGINT', () => {
  DeckBotLogger.info('Encerrando bot (SIGINT)');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  DeckBotLogger.info('Encerrando bot (SIGTERM)');
  bot.stop('SIGTERM');
});

// Inicialização
async function startBot() {
  try {
    DeckBotLogger.info('Iniciando bot...');
    await bot.launch();
    DeckBotLogger.info('Bot rodando com sucesso!');
  } catch (error) {
    DeckBotLogger.error('Erro ao iniciar bot', error);
    process.exit(1);
  }
}

startBot();