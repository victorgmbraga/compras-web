# Hospedagem estática

O artefato de produção é `dist-browser/`. A hospedagem entrega HTML, módulos JavaScript, CSS, favicon, licenças e `browser-config.json`. O navegador pesquisa diretamente o PNCP e gera CSV no Worker; não existe API da aplicação nesse artefato.

## Gerar e verificar

Requer Node.js 22.12 ou superior apenas na máquina de build.

```sh
npm ci
npm test
npm run build:browser
npm run preview:browser
```

Abra `http://localhost:8000` para a fonte real, ou `http://localhost:8000/?demo=1` para demonstração explícita. `preview:browser` serve arquivos e não executa o servidor da aplicação. O artefato pode ser servido por qualquer servidor estático que entregue MIME correto: `text/javascript` para módulos e Worker, `text/css` e `application/json`. A abertura por `file://` não é suportada.

Configure antes do build em [`public/browser-config.json`](../public/browser-config.json), conforme [Configuração](configuracao.md). Esse arquivo é público; não inclua segredos. `{}` usa o PNCP real e os limites padrão. A demonstração não substitui automaticamente uma falha da fonte real.

Publique **o conteúdo da pasta**, incluindo `assets/`, sem prefixar outra pasta `dist-browser` na URL. O build usa caminhos relativos e funciona na raiz ou em `/compras-web/`. Abra a URL do diretório com barra final. Não configure reescrita de `/api/...` para HTML; essas rotas não existem na versão estática.

## GitHub Pages

[`static-pages.yml`](../.github/workflows/static-pages.yml) fornece publicação manual por GitHub Actions. Ele instala dependências, executa testes, compila e publica o artefato, sem servidor Node.js no destino.

1. Disponibilize os arquivos no branch que será publicado.
2. Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**.
3. Em **Actions → Publicar versão estática → Run workflow**, escolha o branch e execute.
4. Confira a URL informada pelo job `deploy`. Em um repositório de projeto, o caminho normalmente inclui `/compras-web/`.
5. Execute o diagnóstico na URL publicada antes de promover essa implantação.

O workflow não publica automaticamente a cada push. A configuração da conta pode exigir aprovação do ambiente `github-pages`. GitHub Pages não interpreta `_headers`; a CSP por `<meta>` e a política de referrer permanecem no HTML, mas cabeçalhos de Worker, `frame-ancestors`, `nosniff` e controle de cache dependem das capacidades do provedor.

## Cloudflare Pages ou servidor estático próprio

Na Cloudflare Pages, selecione build `npm run build:browser`, diretório de saída `dist-browser` e Node.js 24 na máquina de build. Nenhuma Pages Function é necessária. O artefato inclui `_headers`, com CSP, `nosniff`, `no-referrer`, atualização de HTML/configuração e cache imutável para bundles com hash.

Em Nginx, Apache ou outro servidor, configure os mesmos cabeçalhos. A CSP esperada permite scripts e Worker da própria origem e `connect-src 'self' https://pncp.gov.br`. A diretiva `frame-ancestors 'self'` precisa de cabeçalho HTTP. A CSP no HTML é uma alternativa parcial, pois `<meta>` não protege a resposta do Worker nem define `frame-ancestors`.

Não adicione cabeçalhos personalizados nas consultas PNCP para contornar CORS. O transporte nativo usa GET simples sem credenciais; a política de acesso continua sendo definida pela fonte.

## Homologação e atualização

Abra `pncp-diagnostic.html` no domínio HTTPS publicado. **Verificar acesso** executa uma consulta direta na página e a matriz de pesquisas, catálogos, sugestões, detalhes e registros filhos no Worker. **Salvar evidência** registra origem, navegador, data, status/cabeçalhos legíveis da consulta da página e resultado de cada operação. **Cancelar** interrompe o diagnóstico. Os exemplos são documentos públicos específicos; HTTP 404 de um registro inexistente não homologa dados positivos desse recurso.

Teste Chromium, Firefox e Safari usados pelo público, incluindo dispositivo móvel e retomada de uma aba suspensa. Confira pesquisa real, todos os painéis, CSV, cancelamento e links. Os testes sintéticos e de CORS controlado descritos em [Validação](validacao.md) são evidências separadas; não certificam a disponibilidade contínua do PNCP nem a política de uma origem de produção ainda não verificada.

Publicações devem substituir HTML/configuração e disponibilizar os novos bundles em conjunto. Os nomes com hash impedem reutilização indevida de scripts alterados. Preserve temporariamente assets antigos quando a hospedagem permitir, para abas já abertas. HTML e configuração devem ser revalidados; não instale Service Worker para cache de consultas. Versões incompatíveis da ponte são rejeitadas na inicialização. Após atualizar, verifique a página numa nova aba e repita uma pesquisa.

## Retorno ao modo Node.js

Conserve a implantação Node.js operacional durante a homologação. Seus consumidores HTTP continuam usando o domínio anterior e as rotas descritas em [Consultas PNCP](consultas-pncp.md).

Para retornar, direcione a URL operacional para essa implantação ou execute:

```sh
npm ci
npm start
```

Use as variáveis do servidor, sem copiar `browser-config.json` para `.env`. A [implantação Railway](railway.md) e o Dockerfile continuam disponíveis para esse modo. Se o PNCP bloquear CORS ou recursos obrigatórios da origem estática, mantenha a implantação Node.js enquanto a limitação for resolvida; inserir um proxy mudaria o objetivo de hospedagem sem backend próprio.
