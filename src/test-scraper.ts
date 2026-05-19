import puppeteer from 'puppeteer';

async function testScraper() {
  console.log('Iniciando teste do scraper...');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Mude para false para ver o que está acontecendo
    args: ['--no-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Teste 1: Acessar página de decks
    console.log('\n📋 Teste 1: Acessando página de decks...');
    await page.goto('https://limitlesstcg.com/decks', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Aguarda um pouco para carregar conteúdo dinâmico
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Salvar screenshot da página
    await page.screenshot({ path: 'decks-page.png', fullPage: false });
    console.log('✅ Screenshot salvo: decks-page.png');
    
    // Teste 2: Verificar estrutura da tabela
    console.log('\n📋 Teste 2: Analisando estrutura da tabela...');
    
    const tableStructure = await page.evaluate(() => {
      // Verifica se existe tabela
      const tables = document.querySelectorAll('table');
      console.log(`Encontradas ${tables.length} tabelas`);
      
      // Procura por links na tabela
      const links = document.querySelectorAll('table a');
      console.log(`Encontrados ${links.length} links em tabelas`);
      
      // Pega o primeiro link para análise
      const firstLink = links[0];
      if (firstLink) {
        return {
          hasTable: tables.length > 0,
          hasLinks: links.length > 0,
          firstLinkText: firstLink.textContent?.trim(),
          firstLinkHref: firstLink.getAttribute('href'),
          tableHTML: tables[0]?.outerHTML.substring(0, 500) // Primeiros 500 chars
        };
      }
      
      return {
        hasTable: tables.length > 0,
        hasLinks: false,
        error: 'Nenhum link encontrado'
      };
    });
    
    console.log('Estrutura encontrada:', JSON.stringify(tableStructure, null, 2));
    
    // Teste 3: Tentar extrair decks manualmente
    console.log('\n📋 Teste 3: Extraindo decks...');
    
    const decks = await page.evaluate(() => {
      // Tenta diferentes seletores
      const possibleRows = [
        ...document.querySelectorAll('table tbody tr'),
        ...document.querySelectorAll('.deck-row'),
        ...document.querySelectorAll('[class*="deck"]')
      ];
      
      const decks_found = [];
      
      for (let i = 0; i < Math.min(possibleRows.length, 5); i++) {
        const row = possibleRows[i];
        const link = row.querySelector('a');
        const cells = row.querySelectorAll('td');
        
        decks_found.push({
          index: i,
          html: row.outerHTML.substring(0, 300),
          hasLink: !!link,
          linkText: link?.textContent?.trim(),
          linkHref: link?.getAttribute('href'),
          cellCount: cells.length,
          cellTexts: Array.from(cells).map(cell => cell.textContent?.trim())
        });
      }
      
      return decks_found;
    });
    
    console.log('Decks encontrados:', JSON.stringify(decks, null, 2));
    
    // Teste 4: Se encontrou algum deck, tenta acessar a página do primeiro
    if (decks.length > 0 && decks[0].linkHref) {
      console.log('\n📋 Teste 4: Acessando página do primeiro deck...');
      const deckUrl = decks[0].linkHref.startsWith('http') 
        ? decks[0].linkHref 
        : `https://limitlesstcg.com${decks[0].linkHref}`;
      
      console.log(`URL: ${deckUrl}`);
      await page.goto(deckUrl, { waitUntil: 'networkidle2' });
      
      // Aguarda carregar
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await page.screenshot({ path: 'deck-page.png', fullPage: false });
      console.log('✅ Screenshot salvo: deck-page.png');
      
      // Verificar elementos do deck
      const deckElements = await page.evaluate(() => {
        const selectors = [
          '.decklist-container',
          '.deck-list',
          '.decklist',
          '[class*="decklist"]',
          '[class*="deck-list"]'
        ];
        
        const results: { [key: string]: any } = {};
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          results[selector] = {
            exists: !!element,
            textLength: element?.textContent?.length || 0,
            htmlSample: element?.outerHTML.substring(0, 200)
          };
        }
        
        // Procura por cards
        const cards = document.querySelectorAll('.card, [class*="card"]');
        results.cardsFound = cards.length;
        
        return results;
      });
      
      console.log('Elementos do deck:', JSON.stringify(deckElements, null, 2));
      
      // Teste 5: Lista todos os links encontrados na página
      console.log('\n📋 Teste 5: Analisando links da página do deck...');
      const allLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.slice(0, 20).map(link => ({
          text: link.textContent?.trim().substring(0, 50),
          href: link.getAttribute('href'),
          className: link.className
        }));
      });
      
      console.log('Primeiros 20 links encontrados:', JSON.stringify(allLinks, null, 2));
    } else {
      console.log('\n⚠️ Nenhum deck encontrado para testar');
      
      // Se não encontrou decks, lista todos os links da página principal
      console.log('\n📋 Listando todos os links da página principal...');
      const allLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.slice(0, 30).map(link => ({
          text: link.textContent?.trim().substring(0, 50),
          href: link.getAttribute('href'),
          className: link.className
        }));
      });
      
      console.log('Primeiros 30 links:', JSON.stringify(allLinks, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    console.log('\n✨ Teste concluído!');
    console.log('Arquivos gerados:');
    console.log('  - decks-page.png');
    console.log('  - deck-page.png (se encontrado)');
    await browser.close();
  }
}

// Executar teste
testScraper();