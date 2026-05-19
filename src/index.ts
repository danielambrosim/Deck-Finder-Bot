import { Telegraf } from 'telegraf';
import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import { getTopDecks, screenshotDeckPage, closeBrowser } from './topDecks.js';
import { suggestionsManager, Suggestion } from './suggestions.js';

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
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    
    const suggestionsFile = path.join(process.cwd(), 'data', 'suggestions.json');
    const ideasFile = path.join(process.cwd(), 'data', 'ideas.md');
    
    try {
      await fs.access(suggestionsFile);
    } catch {
      await fs.writeFile(suggestionsFile, '[]');
      DeckBotLogger.info('Arquivo suggestions.json criado');
    }
    
    try {
      await fs.access(ideasFile);
    } catch {
      await fs.writeFile(ideasFile, '# Ideias do Bot\n\n');
      DeckBotLogger.info('Arquivo ideas.md criado');
    }
  } catch (error) {
    DeckBotLogger.error('Erro ao criar diretórios', error);
    throw error;
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
  ctx.reply(
    '🎴 Olá! Sou o PokéDeck Bot!\n\n' +
    '📊 Use /topdecks para ver os melhores decks do momento\n' +
    '💡 Use /suggest para enviar sugestões de melhorias\n' +
    '📋 Use /help para ver todos os comandos'
  );
});

bot.help((ctx) => {
  ctx.reply(`
🤖 **Comandos disponíveis:**

**📊 Decks:**
/topdecks - Busca os top 3 decks do Limitless

**💡 Comunidade:**
/suggest - Envie sua ideia ou sugestão
/vote [ID] - Vote nas melhores sugestões
/topsuggestions - Veja as sugestões mais votadas
/roadmap - Veja o roadmap do projeto

**ℹ️ Informações:**
/help - Mostra esta mensagem de ajuda

Desenvolvido com ❤️ para a comunidade Pokémon TCG
  `.trim(), { parse_mode: 'Markdown' });
});

// Comando para sugerir ideias
bot.command('suggest', async (ctx) => {
  const message = ctx.message.text;
  const args = message.split(' ').slice(1);
  
  if (args.length === 0) {
    await ctx.reply(
      `📝 **Como usar o comando /suggest**\n\n` +
      `Envie sua sugestão: /suggest [categoria]: [descrição]\n\n` +
      `Categorias: feature, bug, improvement, other\n\n` +
      `**Exemplo:** /suggest feature: adicionar busca por Pokémon`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const fullSuggestion = args.join(' ');
  const colonIndex = fullSuggestion.indexOf(':');
  
  if (colonIndex === -1) {
    await ctx.reply('❌ Formato inválido! Use: `/suggest categoria: sua sugestão`', { parse_mode: 'Markdown' });
    return;
  }
  
  const categoryStr = fullSuggestion.substring(0, colonIndex).toLowerCase();
  const suggestionText = fullSuggestion.substring(colonIndex + 1).trim();
  
  let category: Suggestion['category'];
  switch (categoryStr) {
    case 'feature': category = 'feature'; break;
    case 'bug': category = 'bug'; break;
    case 'improvement': category = 'improvement'; break;
    default: category = 'other';
  }
  
  if (!suggestionText) {
    await ctx.reply('❌ Por favor, forneça uma descrição para sua sugestão.');
    return;
  }
  
  try {
    const suggestion = await suggestionsManager.addSuggestion(
      ctx.from.id, suggestionText, category,
      ctx.from.username, ctx.from.first_name
    );
    
    const categoryEmoji = { feature: '✨', bug: '🐛', improvement: '⚡', other: '💡' };
    
    await ctx.reply(
      `${categoryEmoji[category]} **Sugestão registrada!**\n\n` +
      `**ID:** ${suggestion.id}\n` +
      `**Categoria:** ${category}\n` +
      `**Sugestão:** ${suggestionText}\n\n` +
      `Obrigado pela contribuição! Use /vote ${suggestion.id} para votar nesta ideia.`,
      { parse_mode: 'Markdown' }
    );
    
    if (process.env.ADMIN_USER_ID) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_USER_ID,
        `📬 Nova sugestão de ${ctx.from.first_name} (@${ctx.from.username || 'sem username'})\n` +
        `ID: ${suggestion.id}\nCategoria: ${category}\nSugestão: ${suggestionText}`
      ).catch(err => DeckBotLogger.error('Erro ao notificar admin', err));
    }
  } catch (error) {
    DeckBotLogger.error('Erro ao salvar sugestão', error);
    await ctx.reply('❌ Erro ao salvar sua sugestão. Tente novamente mais tarde.');
  }
});

// Comando para votar
bot.command('vote', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length === 0) {
    await ctx.reply('🗳️ **Como usar:** /vote [ID]\n\nUse /topsuggestions para ver as ideias.', { parse_mode: 'Markdown' });
    return;
  }
  
  const suggestionId = args[0];
  
  try {
    const success = await suggestionsManager.voteSuggestion(suggestionId, ctx.from.id);
    if (success) {
      await ctx.reply('✅ Seu voto foi registrado! Obrigado por contribuir.');
    } else {
      await ctx.reply('❌ Você já votou nesta sugestão ou a sugestão não existe.');
    }
  } catch (error) {
    DeckBotLogger.error('Erro ao votar', error);
    await ctx.reply('❌ Erro ao registrar voto.');
  }
});

// Comando para ver top sugestões
bot.command('topsuggestions', async (ctx) => {
  try {
    const topSuggestions = await suggestionsManager.getTopSuggestions(5);
    
    if (topSuggestions.length === 0) {
      await ctx.reply('📭 Nenhuma sugestão encontrada. Seja o primeiro a sugerir usando /suggest!');
      return;
    }
    
    const categoryEmoji = { feature: '✨', bug: '🐛', improvement: '⚡', other: '💡' };
    let message = '🏆 **Top Sugestões da Comunidade**\n\n';
    
    topSuggestions.forEach((suggestion, index) => {
      message += `${index + 1}. ${categoryEmoji[suggestion.category]} **${suggestion.category.toUpperCase()}**\n`;
      message += `   *${suggestion.suggestion.substring(0, 100)}${suggestion.suggestion.length > 100 ? '...' : ''}*\n`;
      message += `   👍 ${suggestion.votes} votos | ID: ${suggestion.id}\n\n`;
    });
    
    message += '💡 **Quer ajudar?**\n• Vote nas sugestões: /vote [ID]\n• Envie sua ideia: /suggest\n• Veja o roadmap: /roadmap';
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    DeckBotLogger.error('Erro ao buscar sugestões', error);
    await ctx.reply('❌ Erro ao buscar sugestões.');
  }
});

// Comando para roadmap
bot.command('roadmap', async (ctx) => {
  const roadmapMessage = `
🗺️ **Roadmap do PokéDeck Bot**

**✅ Implementado**
• Busca dos top 3 decks do Limitless
• Envio de screenshots dos decks
• Geração de PDF com todos os decks
• Sistema de sugestões da comunidade

**🚀 Em Desenvolvimento**
• Cache de resultados para melhor performance
• Melhorias no sistema de screenshot

**📋 Planejado**
• Busca por Pokémon específico
• Comparador de decks
• Estatísticas de meta

**Status atual:** 🟢 Bot operacional
  `;
  await ctx.reply(roadmapMessage, { parse_mode: 'Markdown' });
});

// Comando para estatísticas (admin)
bot.command('botstats', async (ctx) => {
  const adminId = process.env.ADMIN_USER_ID;
  
  if (!adminId || ctx.from.id.toString() !== adminId) {
    await ctx.reply('❌ Este comando é restrito aos administradores.');
    return;
  }
  
  const stats = suggestionsManager.getStatistics();
  
  const statsMessage = `
📊 **Estatísticas do Bot**
**Sugestões:** Total: ${stats.totalSuggestions} | Pendentes: ${stats.pending} | Implementadas: ${stats.implemented}
**Total de votos:** ${stats.totalVotes}
🟢 Bot status: Online
  `;
  await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
});

// Comando topdecks
bot.command('topdecks', async (ctx) => {
  const userId = ctx.from?.id;
  DeckBotLogger.info(`Comando /topdecks recebido do usuário ${userId}`);

  try {
    const processingMessage = await ctx.reply('⏳ Buscando os top decks do Limitless...');
    await ensureDirectories();

    const decks = await getTopDecks(3);
    
    if (!decks || decks.length === 0) {
      await ctx.reply('❌ Nenhum deck encontrado no momento.');
      return;
    }

    const imagePaths: string[] = [];
    const tempFiles: string[] = [];

    for (let i = 0; i < decks.length; i++) {
      const deck = decks[i];
      if (!deck) continue;

      try {
        const fileName = `deck_${Date.now()}_${i + 1}.png`;
        const screenshotPath = await screenshotDeckPage(deck.url, fileName);
        
        imagePaths.push(screenshotPath);
        tempFiles.push(screenshotPath);

        const caption = `🏆 **Deck ${i + 1}:** ${deck.title}\n\n📊 **Posição:** ${deck.position || 'N/A'}\n👤 **Jogador:** ${deck.player || 'Não informado'}`;
        
        await ctx.replyWithPhoto({ source: screenshotPath }, { caption, parse_mode: 'Markdown' as const });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (deckError) {
        DeckBotLogger.error(`Erro ao processar deck ${i + 1}`, deckError);
        await ctx.reply(`⚠️ Erro ao processar o deck ${i + 1}. Pulando para o próximo...`);
      }
    }

    if (imagePaths.length > 0) {
      try {
        const pdfPath = await generatePDF(imagePaths);
        tempFiles.push(pdfPath);
        await ctx.replyWithDocument({ source: pdfPath, filename: `top_decks_${new Date().toISOString().split('T')[0]}.pdf` }, { caption: '📋 PDF com todos os decks' });
      } catch (pdfError) {
        DeckBotLogger.error('Erro ao gerar PDF', pdfError);
        await ctx.reply('⚠️ Erro ao gerar o PDF, mas as imagens foram enviadas.');
      }
    }

    await saveToHistory(decks);
    await cleanupFiles(tempFiles);
    await ctx.reply('✅ Busca concluída com sucesso!');

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
const gracefulShutdown = async (signal: string) => {
  DeckBotLogger.info(`Recebido sinal ${signal}, encerrando bot...`);
  try {
    await closeBrowser();
    await bot.stop(signal);
    DeckBotLogger.info('Bot encerrado com sucesso');
    process.exit(0);
  } catch (error) {
    DeckBotLogger.error('Erro ao encerrar bot', error);
    process.exit(1);
  }
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Inicialização
async function startBot() {
  try {
    DeckBotLogger.info('Iniciando bot...');
    await ensureDirectories();
    await suggestionsManager.loadSuggestions();
    await suggestionsManager.loadIdeas();
    DeckBotLogger.info('Sistema de sugestões inicializado');
    await bot.launch();
    DeckBotLogger.info('Bot rodando com sucesso!');
  } catch (error) {
    DeckBotLogger.error('Erro ao iniciar bot', error);
    process.exit(1);
  }
}

startBot();