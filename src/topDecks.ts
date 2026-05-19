import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

let sharedBrowser: Browser | null = null;

// Detecta o caminho do Chrome baseado no SO
function getChromePath(): string | undefined {
  switch (process.platform) {
    case 'win32':
      return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    case 'darwin': // macOS
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':
      return '/usr/bin/google-chrome';
    default:
      return undefined; // Usa o Chromium padrão do puppeteer
  }
}

const PUPPETEER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
};

const BASE_URL = 'https://limitlesstcg.com';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

// Função auxiliar para delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class DeckScraperLogger {
  static info(message: string, ...args: any[]) {
    console.log(`[SCRAPER] ${new Date().toISOString()} - ${message}`, ...args);
  }

  static error(message: string, error?: any) {
    console.error(`[SCRAPER ERROR] ${new Date().toISOString()} - ${message}`, error);
  }

  static warn(message: string, ...args: any[]) {
    console.warn(`[SCRAPER WARN] ${new Date().toISOString()} - ${message}`, ...args);
  }
}

async function ensureScreenshotsDir(): Promise<void> {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    DeckScraperLogger.info(`Diretório de screenshots verificado: ${SCREENSHOTS_DIR}`);
  } catch (error) {
    DeckScraperLogger.error('Erro ao criar diretório de screenshots', error);
    throw error;
  }
}

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    DeckScraperLogger.info('Criando navegador Chrome...');
    
    const chromePath = getChromePath();
    const launchOptions: any = {
      headless: true,
      args: PUPPETEER_OPTIONS.args
    };
    
    if (chromePath) {
      launchOptions.executablePath = chromePath;
      DeckScraperLogger.info(`Usando Chrome em: ${chromePath}`);
    } else {
      DeckScraperLogger.info('Usando Chromium padrão do Puppeteer');
    }
    
    try {
      sharedBrowser = await puppeteer.launch(launchOptions);
      DeckScraperLogger.info('Navegador criado com sucesso');
    } catch (error) {
      DeckScraperLogger.error('Erro ao criar navegador, tentando sem executablePath', error);
      sharedBrowser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_OPTIONS.args
      });
    }
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
    DeckScraperLogger.info('Navegador fechado');
  }
}

async function withPage<T>(operation: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Adiciona headers para parecer mais realista
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });

  try {
    return await operation(page);
  } finally {
    await page.close().catch(error => {
      DeckScraperLogger.error('Erro ao fechar página', error);
    });
  }
}

export interface DeckInfo {
  title: string;
  url: string;
  position?: number;
  player?: string;
}

export async function getTopDecks(limit = 3): Promise<DeckInfo[]> {
  DeckScraperLogger.info(`Buscando top ${limit} decks`);

  return await withPage(async (page) => {
    try {
      // Acessa a página de decks
      await page.goto(`${BASE_URL}/decks`, { 
        waitUntil: 'networkidle0',
        timeout: 45000 
      });
      
      // Aguarda conteúdo carregar
      await delay(3000);
      
      // Verifica se há bloqueio (Cloudflare, etc)
      const pageContent = await page.content();
      if (pageContent.includes('captcha') || pageContent.includes('Access Denied')) {
        throw new Error('Site bloqueou o acesso (possível Cloudflare)');
      }
      
      let decks: DeckInfo[] = [];
      
      // ESTRATÉGIA 1: Links que contêm '/deck/'
      DeckScraperLogger.info('Tentando extrair decks via links /deck/...');
      decks = await page.evaluate((baseUrl) => {
        const allLinks = Array.from(document.querySelectorAll('a'));
        const deckLinks = allLinks.filter(link => {
          const href = link.getAttribute('href');
          return href && href.includes('/deck/') && !href.includes('/decks/');
        });
        
        // Remove duplicatas baseado na URL
        const uniqueLinks = new Map();
        deckLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href && !uniqueLinks.has(href)) {
            uniqueLinks.set(href, link);
          }
        });
        
        return Array.from(uniqueLinks.values()).slice(0, 10).map((link, idx) => ({
          title: link.textContent?.trim() || link.getAttribute('title') || `Deck ${idx + 1}`,
          url: link.getAttribute('href') || '',
          position: idx + 1,
          player: 'Informação não disponível'
        }));
      }, BASE_URL);
      
      if (decks.length > 0) {
        decks = decks.map(deck => ({
          ...deck,
          url: deck.url.startsWith('http') ? deck.url : BASE_URL + deck.url
        }));
        DeckScraperLogger.info(`Estratégia 1 encontrou ${decks.length} decks`);
      }
      
      // ESTRATÉGIA 2: Tabela tradicional
      if (decks.length === 0) {
        DeckScraperLogger.info('Tentando extrair decks via tabela...');
        decks = await page.evaluate((limit, baseUrl) => {
          const rows = Array.from(document.querySelectorAll('table tbody tr, .deck-row, [data-deck-id]')).slice(0, limit);
          
          return rows.map((row, index) => {
            const link = row.querySelector('a');
            const cells = row.querySelectorAll('td');
            const playerCell = cells[1]?.textContent?.trim() || cells[2]?.textContent?.trim();
            const title = link?.textContent?.trim() || link?.getAttribute('title') || `Deck ${index + 1}`;
            const url = link?.getAttribute('href') || '';
            
            return {
              title,
              url: url.startsWith('http') ? url : baseUrl + url,
              position: index + 1,
              player: playerCell || 'Não informado'
            };
          });
        }, limit, BASE_URL);
        
        if (decks.length > 0) {
          DeckScraperLogger.info(`Estratégia 2 encontrou ${decks.length} decks`);
        }
      }
      
      // ESTRATÉGIA 3: Qualquer link que pareça ser de deck
      if (decks.length === 0) {
        DeckScraperLogger.info('Tentando extrair decks via links genéricos...');
        decks = await page.evaluate((baseUrl) => {
          const allLinks = Array.from(document.querySelectorAll('a'));
          const possibleDeckLinks = allLinks.filter(link => {
            const href = link.getAttribute('href');
            const text = link.textContent || '';
            return href && (
              href.match(/\/deck\/\d+/) ||
              text.match(/deck/i) ||
              link.className.match(/deck/i)
            );
          }).slice(0, 5);
          
          return possibleDeckLinks.map((link, idx) => ({
            title: link.textContent?.trim() || `Deck ${idx + 1}`,
            url: link.getAttribute('href') || '',
            position: idx + 1,
            player: 'Informação não disponível'
          }));
        }, BASE_URL);
        
        decks = decks.map(deck => ({
          ...deck,
          url: deck.url.startsWith('http') ? deck.url : BASE_URL + deck.url
        }));
        
        if (decks.length > 0) {
          DeckScraperLogger.info(`Estratégia 3 encontrou ${decks.length} decks`);
        }
      }
      
      if (decks.length === 0) {
        // Salva HTML para debug
        const html = await page.content();
        await fs.writeFile('debug_limitless_page.html', html);
        DeckScraperLogger.error('Nenhum deck encontrado. HTML salvo em debug_limitless_page.html');
        throw new Error('Nenhum deck encontrado na página');
      }
      
      // Retorna apenas os primeiros 'limit' decks
      const result = decks.slice(0, limit);
      DeckScraperLogger.info(`Total de ${result.length} decks extraídos com sucesso`);
      return result;
      
    } catch (error) {
      DeckScraperLogger.error('Erro ao buscar decks', error);
      throw new Error(`Falha ao buscar decks: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  });
}

export async function screenshotDeckPage(deckUrl: string, fileName: string): Promise<string> {
  DeckScraperLogger.info(`Capturando screenshot: ${fileName} - URL: ${deckUrl}`);

  await ensureScreenshotsDir();

  return await withPage(async (page) => {
    try {
      // Acessa a página do deck
      await page.goto(deckUrl, { 
        waitUntil: 'networkidle0',
        timeout: 45000 
      });
      
      // Aguarda conteúdo carregar
      await delay(5000);
      
      // Verifica se a página carregou corretamente
      const pageContent = await page.content();
      if (pageContent.includes('404') || pageContent.includes('Not Found')) {
        throw new Error('Página do deck não encontrada (404)');
      }
      
      const screenshotPath = path.join(SCREENSHOTS_DIR, fileName);
      
      // Lista de seletores possíveis para o conteúdo do deck
      const selectorsToTry = [
        '.decklist-container',
        '.deck-list', 
        '.decklist',
        '[class*="decklist"]',
        '[class*="deck-list"]',
        '.card-grid',
        '[class*="card-list"]',
        '[class*="cards"]',
        'main .container',
        '#deck-area',
        '.container.mt-4',
        'body > div:nth-child(3)'
      ];
      
      let element = null;
      let usedSelector = '';
      
      // Tenta encontrar o elemento do deck
      for (const selector of selectorsToTry) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          element = await page.$(selector);
          if (element) {
            usedSelector = selector;
            DeckScraperLogger.info(`Elemento encontrado com seletor: ${selector}`);
            break;
          }
        } catch (e) {
          // Continua tentando
        }
      }
      
      // Se não encontrou elemento específico, tenta encontrar cards individuais
      if (!element) {
        DeckScraperLogger.warn('Buscando por cards individuais...');
        const cards = await page.$$('.card, [class*="card"], [class*="Card"]');
        
        if (cards.length > 0) {
          DeckScraperLogger.info(`Encontrados ${cards.length} cards, capturando o primeiro`);
          element = cards[0];
          usedSelector = 'individual-card';
        }
      }
      
      // Captura o screenshot
      if (!element) {
        DeckScraperLogger.warn('Nenhum elemento específico encontrado, capturando página inteira');
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        });
      } else {
        await element.screenshot({ 
          path: screenshotPath,
          type: 'png'
        });
      }
      
      // Verifica se o screenshot foi criado com sucesso
      const stats = await fs.stat(screenshotPath).catch(() => null);
      if (!stats || stats.size === 0) {
        throw new Error('Screenshot vazio ou não criado');
      }
      
      DeckScraperLogger.info(`Screenshot salvo: ${screenshotPath} (${(stats.size / 1024).toFixed(2)} KB)`);
      return screenshotPath;
      
    } catch (error) {
      DeckScraperLogger.error(`Erro ao capturar screenshot de ${deckUrl}`, error);
      throw new Error(`Falha ao capturar screenshot: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  });
}

export async function getDeckDetailedInfo(deckUrl: string): Promise<any> {
  DeckScraperLogger.info(`Buscando informações detalhadas: ${deckUrl}`);

  return await withPage(async (page) => {
    try {
      await page.goto(deckUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      await delay(3000);

      const deckInfo = await page.evaluate(() => {
        // Tenta diferentes seletores para o container
        const container = document.querySelector('.decklist-container, .deck-list, [class*="decklist"]');
        
        if (!container) {
          return { error: 'Container não encontrado', totalCards: 0 };
        }
        
        // Tenta encontrar cards
        const cards = Array.from(container.querySelectorAll('.card, [class*="card"], [class*="Card"]'));
        
        return {
          cards: cards.slice(0, 60).map(card => ({
            name: card.querySelector('.card-name, .name, [class*="name"]')?.textContent?.trim(),
            count: card.querySelector('.card-count, .count, [class*="count"]')?.textContent?.trim()
          })),
          totalCards: cards.length,
          containerFound: true
        };
      });

      return deckInfo;
    } catch (error) {
      DeckScraperLogger.error('Erro ao buscar informações do deck', error);
      return { error: 'Falha ao buscar informações', totalCards: 0 };
    }
  });
}

export async function checkWebsiteHealth(): Promise<boolean> {
  try {
    return await withPage(async (page) => {
      const response = await page.goto(BASE_URL, { 
        waitUntil: 'networkidle2',
        timeout: 15000 
      });
      const isOk = response?.status() === 200;
      DeckScraperLogger.info(`Health check: ${isOk ? 'OK' : 'FAILED'} (status: ${response?.status()})`);
      return isOk;
    });
  } catch (error) {
    DeckScraperLogger.error('Site não está acessível', error);
    return false;
  }
}