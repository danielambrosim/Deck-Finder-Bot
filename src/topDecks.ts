import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

// Configurações
const PUPPETEER_OPTIONS = {
  headless: true, // Corrigido: boolean em vez de string
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
const DECKLIST_SELECTOR = '.decklist-container';
const DECK_TABLE_SELECTOR = 'table a';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

// Logger específico para o módulo
class DeckScraperLogger {
  static info(message: string, ...args: any[]) {
    console.log(`[SCRAPER] ${new Date().toISOString()} - ${message}`, ...args);
  }

  static error(message: string, error?: any) {
    console.error(`[SCRAPER ERROR] ${new Date().toISOString()} - ${message}`, error);
  }
}

// Utilitários
async function ensureScreenshotsDir(): Promise<void> {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    DeckScraperLogger.info(`Diretório de screenshots verificado: ${SCREENSHOTS_DIR}`);
  } catch (error) {
    DeckScraperLogger.error('Erro ao criar diretório de screenshots', error);
    throw error;
  }
}

async function withBrowser<T>(operation: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  
  try {
    return await operation(browser);
  } finally {
    await browser.close().catch(error => {
      DeckScraperLogger.error('Erro ao fechar browser', error);
    });
  }
}

async function withPage<T>(browser: Browser, operation: (page: Page) => Promise<T>): Promise<T> {
  const page = await browser.newPage();
  
  // Configurações de performance
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    return await operation(page);
  } finally {
    await page.close().catch(error => {
      DeckScraperLogger.error('Erro ao fechar página', error);
    });
  }
}

// Funções principais
export interface DeckInfo {
  title: string;
  url: string;
  position?: number;
  player?: string;
}

export async function getTopDecks(limit = 3): Promise<DeckInfo[]> {
  DeckScraperLogger.info(`Buscando top ${limit} decks`);

  return await withBrowser(async (browser) => {
    return await withPage(browser, async (page) => {
      try {
        await page.goto(`${BASE_URL}/decks`, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Aguarda a tabela carregar
        await page.waitForSelector(DECK_TABLE_SELECTOR, { timeout: 15000 });

        const decks = await page.evaluate((limit, baseUrl) => {
          const rows = Array.from(document.querySelectorAll('table tbody tr')).slice(0, limit);
          
          return rows.map((row, index) => {
            const link = row.querySelector('a');
            const cells = row.querySelectorAll('td');
            
            // Tenta extrair informações adicionais
            const playerCell = cells[1]?.textContent?.trim(); // Assumindo que a segunda célula é o jogador
            const title = link?.textContent?.trim() || `Deck ${index + 1}`;
            const url = link?.getAttribute('href') || '';

            return {
              title,
              url: url.startsWith('http') ? url : baseUrl + url,
              position: index + 1,
              player: playerCell || 'Não informado'
            };
          });
        }, limit, BASE_URL);

        DeckScraperLogger.info(`Encontrados ${decks.length} decks`);
        return decks;

      } catch (error) {
        DeckScraperLogger.error('Erro ao buscar decks', error);
        throw new Error(`Falha ao buscar decks: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    });
  });
}

export async function screenshotDeckPage(deckUrl: string, fileName: string): Promise<string> {
  DeckScraperLogger.info(`Capturando screenshot: ${fileName}`);

  await ensureScreenshotsDir();

  return await withBrowser(async (browser) => {
    return await withPage(browser, async (page) => {
      try {
        await page.goto(deckUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Aguarda o elemento específico carregar
        await page.waitForSelector(DECKLIST_SELECTOR, { timeout: 15000 });

        const screenshotPath = path.join(SCREENSHOTS_DIR, fileName);
        const element = await page.$(DECKLIST_SELECTOR);

        if (!element) {
          throw new Error(`Elemento não encontrado: ${DECKLIST_SELECTOR}`);
        }

        // Configurações de screenshot
        await element.screenshot({ 
          path: screenshotPath,
          type: 'png',
          quality: 90
        });

        // Verifica se o arquivo foi criado
        try {
          await fs.access(screenshotPath);
          DeckScraperLogger.info(`Screenshot salvo: ${screenshotPath}`);
        } catch {
          throw new Error('Falha ao salvar screenshot');
        }

        return screenshotPath;

      } catch (error) {
        DeckScraperLogger.error(`Erro ao capturar screenshot de ${deckUrl}`, error);
        throw new Error(`Falha ao capturar screenshot: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    });
  });
}

// Função adicional para buscar informações detalhadas do deck
export async function getDeckDetailedInfo(deckUrl: string): Promise<any> {
  DeckScraperLogger.info(`Buscando informações detalhadas: ${deckUrl}`);

  return await withBrowser(async (browser) => {
    return await withPage(browser, async (page) => {
      try {
        await page.goto(deckUrl, { waitUntil: 'networkidle2' });

        const deckInfo = await page.evaluate(() => {
          const container = document.querySelector('.decklist-container');
          const cards = Array.from(container?.querySelectorAll('.card') || []);
          
          return {
            cards: cards.map(card => ({
              name: card.querySelector('.card-name')?.textContent?.trim(),
              count: card.querySelector('.card-count')?.textContent?.trim()
            })),
            totalCards: cards.length
          };
        });

        return deckInfo;
      } catch (error) {
        DeckScraperLogger.error('Erro ao buscar informações do deck', error);
        return null;
      }
    });
  });
}

// Função de saúde para verificar se o site está acessível
export async function checkWebsiteHealth(): Promise<boolean> {
  try {
    return await withBrowser(async (browser) => {
      return await withPage(browser, async (page) => {
        const response = await page.goto(BASE_URL, { 
          waitUntil: 'networkidle2',
          timeout: 15000 
        });
        return response?.status() === 200;
      });
    });
  } catch (error) {
    DeckScraperLogger.error('Site não está acessível', error);
    return false;
  }
}