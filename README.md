# 🃏 Deck Finder Bot

Um bot para Telegram que ajuda você a encontrar decks de cartas (de TCGs como Magic: The Gathering, Pokémon, Yu-Gi-Oh!, etc.) utilizando web scraping e uma interface simples e interativa.

## ✨ Funcionalidades

- 🔍 **Busca por decks** a partir de comandos enviados no Telegram.
- 🤖 **Interface amigável** com botões e menus interativos.
- 🌐 **Web scraping** para obter informações atualizadas de sites de referência.
- ⚙️ **Configurável** através de variáveis de ambiente.

## 🚀 Tecnologias Utilizadas

- **[Node.js](https://nodejs.org/)** - Ambiente de execução JavaScript.
- **[TypeScript](https://www.typescriptlang.org/)** - Superset tipado do JavaScript.
- **[Telegraf](https://telegraf.js.org/)** - Framework moderno para bots do Telegram.
- **[Puppeteer](https://pptr.dev/)** - Biblioteca para automação e scraping de páginas web.
- **[Node-fetch](https://github.com/node-fetch/node-fetch)** - Para requisições HTTP adicionais.

## 📋 Pré-requisitos

Antes de começar, você vai precisar ter instalado em sua máquina:

- [Git](https://git-scm.com)
- [Node.js](https://nodejs.org/) (versão 14 ou superior)
- [npm](https://www.npmjs.com/) (geralmente já vem com o Node.js)
- Um **Token de Bot do Telegram**. Você pode obter um falando com o [@BotFather](https://t.me/botfather).

## 🔧 Instalação e Execução

Siga os passos abaixo para rodar o projeto localmente:

1. **Clone o repositório**
   ```bash
   git clone https://github.com/danielambrosim/Deck-Finder-Bot.git
   cd Deck-Finder-Bot

2. **Instale as dependências**
   ```bash
   npm install

2. **Configure as variáveis de ambiente
Crie um arquivo .env na raiz do projeto para armazenar suas configurações sensíveis:**

# Token do seu bot (obrigatório)
 BOT_TOKEN=seu_token_aqui_obtido_no_botfather

# Outras configurações (se aplicável)
# DATABASE_URL=postgresql://usuario:senha@localhost:5432/deckbot
# NODE_ENV=development

# ⚠️ Importante: Nunca commite o arquivo .env. Ele já está listado no .gitignore para proteger suas credenciais.

4. **Execute o bot**
   Você pode rodar o projeto de duas formas:
    
   # Modo	                 Comando	                Descrição
    Desenvolvimento	     npm run dev	            Inicia com recarga automática (hot-reload) usando ts-node. Ideal para testes e desenvolvimento.
    Produção	           npm run build
                         npm start	              Compila o TypeScript para JavaScript e executa o código otimizado. Recomendado para deploy.
