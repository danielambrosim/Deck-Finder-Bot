import puppeteer from 'puppeteer';
import fs from 'fs/promises';

const BASE_URL = 'https://limitlesstcg.com';

// Função auxiliar para delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function diagnostic() {
  console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO\n');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Modo visível para ver o que acontece
    args: ['--no-sandbox', '--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // ========================================
    // TESTE 1: Acessar página principal de decks
    // ========================================
    console.log('📋 TESTE 1: Acessando https://limitlesstcg.com/decks');
    await page.goto(`${BASE_URL}/decks`, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await delay(3000); // Espera conteúdo dinâmico
    
    console.log('✅ Página carregada');
    await page.screenshot({ path: 'debug_1_decks_page.png', fullPage: false });
    console.log('📸 Screenshot salvo: debug_1_decks_page.png\n');
    
    // ========================================
    // TESTE 2: Analisar estrutura da página
    // ========================================
    console.log('📋 TESTE 2: Analisando estrutura HTML');
    
    const pageStructure = await page.evaluate(() => {
      // Verifica todos os elementos que podem conter decks
      const possibleContainers = {
        tables: document.querySelectorAll('table').length,
        tableBodies: document.querySelectorAll('tbody').length,
        tableRows: document.querySelectorAll('tr').length,
        links: document.querySelectorAll('a').length,
        deckClasses: document.querySelectorAll('[class*="deck"]').length,
        cardClasses: document.querySelectorAll('[class*="card"]').length,
      };
      
      // Pega o HTML da primeira tabela se existir
      let firstTableHTML = '';
      const firstTable = document.querySelector('table');
      if (firstTable) {
        firstTableHTML = firstTable.outerHTML.substring(0, 1000);
      }
      
      // Procura por links que parecem ser de decks
      const allLinks = Array.from(document.querySelectorAll('a')).slice(0, 10);
      const deckLinks = allLinks.filter(link => {
        const href = link.getAttribute('href');
        const text = link.textContent || '';
        return href && (href.includes('/deck/') || text.includes('Deck'));
      });
      
      return {
        possibleContainers,
        firstTableHTML,
        totalLinks: allLinks.length,
        deckLinksCount: deckLinks.length,
        sampleDeckLinks: deckLinks.slice(0, 5).map(link => ({
          text: link.textContent?.trim(),
          href: link.getAttribute('href')
        }))
      };
    });
    
    console.log('Estrutura encontrada:', JSON.stringify(pageStructure, null, 2));
    console.log('');
    
    // ========================================
    // TESTE 3: Tentar extrair decks com diferentes estratégias
    // ========================================
    console.log('📋 TESTE 3: Extraindo decks da página');
    
    const extractionMethods = await page.evaluate((baseUrl) => {
      const results: any[] = [];
      
      // Método 1: tabela tradicional
      const tableRows = Array.from(document.querySelectorAll('table tbody tr'));
      if (tableRows.length > 0) {
        const decks = tableRows.slice(0, 3).map((row, idx) => {
          const link = row.querySelector('a');
          const cells = row.querySelectorAll('td');
          return {
            method: 'table',
            title: link?.textContent?.trim() || `Deck ${idx + 1}`,
            url: link?.getAttribute('href') || '',
            player: cells[1]?.textContent?.trim(),
            position: idx + 1
          };
        });
        results.push(...decks);
      }
      
      // Método 2: elementos com classe deck
      const deckElements = Array.from(document.querySelectorAll('[class*="deck"]')).filter(el => 
        el.querySelector('a')
      ).slice(0, 3);
      
      deckElements.forEach((el, idx) => {
        const link = el.querySelector('a');
        if (link) {
          results.push({
            method: 'class-based',
            title: link.textContent?.trim() || `Deck ${idx + 1}`,
            url: link.getAttribute('href') || '',
            player: 'N/A',
            position: results.length + 1
          });
        }
      });
      
      // Método 3: qualquer link que contenha '/deck/'
      const deckLinks = Array.from(document.querySelectorAll('a')).filter(link => {
        const href = link.getAttribute('href');
        return href && href.includes('/deck/');
      }).slice(0, 3);
      
      deckLinks.forEach((link, idx) => {
        results.push({
          method: 'url-based',
          title: link.textContent?.trim() || `Deck ${idx + 1}`,
          url: link.getAttribute('href') || '',
          player: 'N/A',
          position: results.length + 1
        });
      });
      
      return results.map(deck => ({
        ...deck,
        url: deck.url.startsWith('http') ? deck.url : baseUrl + deck.url
      }));
    }, BASE_URL);
    
    console.log('Decks encontrados:', JSON.stringify(extractionMethods, null, 2));
    console.log('');
    
    if (extractionMethods.length === 0) {
      console.log('❌ NENHUM DECK ENCONTRADO! O site pode ter mudado completamente a estrutura.');
      console.log('Salvando HTML da página para análise...');
      
      const html = await page.content();
      await fs.writeFile('debug_page.html', html);
      console.log('✅ HTML salvo em debug_page.html');
      return;
    }
    
    // ========================================
    // TESTE 4: Acessar página do primeiro deck
    // ========================================
    const firstDeck = extractionMethods[0];
    console.log(`📋 TESTE 4: Acessando deck - ${firstDeck.title}`);
    console.log(`URL: ${firstDeck.url}`);
    
    await page.goto(firstDeck.url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await delay(3000);
    await page.screenshot({ path: 'debug_2_deck_page.png', fullPage: false });
    console.log('📸 Screenshot salvo: debug_2_deck_page.png\n');
    
    // ========================================
    // TESTE 5: Analisar elementos do deck
    // ========================================
    console.log('📋 TESTE 5: Analisando elementos do deck');
    
    const deckElements = await page.evaluate(() => {
      // Lista de seletores possíveis
      const selectors = [
        '.decklist-container',
        '.deck-list',
        '.decklist',
        '[class*="decklist"]',
        '.card-grid',
        '.deck-cards',
        '[class*="cards"]',
        'main',
        '.container'
      ];
      
      const found: any[] = [];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          found.push({
            selector,
            exists: true,
            children: element.children.length,
            textLength: element.textContent?.length || 0,
            classNames: element.className,
            htmlSample: element.outerHTML.substring(0, 300)
          });
        } else {
          found.push({ selector, exists: false });
        }
      }
      
      // Procura por cards individuais
      const cards = document.querySelectorAll('.card, [class*="card"], [class*="Card"]');
      
      return {
        foundElements: found,
        cardsFound: cards.length,
        sampleCardHTML: cards[0]?.outerHTML.substring(0, 500),
        pageTitle: document.title,
        bodyClasses: document.body.className
      };
    });
    
    console.log('Elementos encontrados:', JSON.stringify(deckElements, null, 2));
    console.log('');
    
    if (deckElements.cardsFound === 0) {
      console.log('⚠️ NENHUM CARD ENCONTRADO!');
      console.log('Salvando HTML da página do deck...');
      
      const html = await page.content();
      await fs.writeFile('debug_deck_page.html', html);
      console.log('✅ HTML salvo em debug_deck_page.html');
    }
    
    // ========================================
    // TESTE 6: Verificar se há redirect ou bloqueio
    // ========================================
    console.log('📋 TESTE 6: Verificando status da página');
    
    const pageStatus = await page.evaluate(() => ({
      url: window.location.href,
      isBlocked: document.body.innerText.includes('blocked') || 
                 document.body.innerText.includes('captcha'),
      hasError: document.body.innerText.includes('404') || 
                document.body.innerText.includes('error'),
      readyState: document.readyState
    }));
    
    console.log('Status:', pageStatus);
    
    // ========================================
    // TESTE 7: Listar todos os links da página
    // ========================================
    console.log('\n📋 TESTE 7: Listando todos os links da página');
    
    const allLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.slice(0, 30).map(link => ({
        text: link.textContent?.trim().substring(0, 50),
        href: link.getAttribute('href'),
        className: link.className
      }));
    });
    
    console.log('Primeiros 30 links:', JSON.stringify(allLinks, null, 2));
    
  } catch (error) {
    console.error('❌ Erro durante diagnóstico:', error);
  } finally {
    console.log('\n✨ Diagnóstico concluído!');
    console.log('Arquivos gerados:');
    console.log('  - debug_1_decks_page.png');
    console.log('  - debug_2_deck_page.png');
    
    // Verifica se os arquivos HTML foram criados
    try {
      await fs.access('debug_page.html');
      console.log('  - debug_page.html');
    } catch (e) {
      // Arquivo não existe
    }
    
    try {
      await fs.access('debug_deck_page.html');
      console.log('  - debug_deck_page.html');
    } catch (e) {
      // Arquivo não existe
    }
    
    await browser.close();
  }
}

// Executar diagnóstico
diagnostic();