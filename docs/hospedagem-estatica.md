# Hospedagem estática

A aplicação está disponível em [contratos-web.net.br](https://contratos-web.net.br/). O repositório é [victorgmbraga/contratos-web](https://github.com/victorgmbraga/contratos-web).

O artefato de produção é `dist-browser/`. A hospedagem entrega HTML, JavaScript, CSS, favicon, licenças e `browser-config.json`; o navegador consulta o PNCP e gera o CSV.

## Gerar e verificar

Use Node.js 22.12 ou superior na máquina de build:

```sh
npm ci
npm test
npm run build
npm run preview
```

Abra `http://localhost:8000` para a fonte real ou `http://localhost:8000/?demo=1` para demonstração. O preview usa os arquivos compilados.

Configure [`public/browser-config.json`](../public/browser-config.json) conforme [Configuração](configuracao.md). `{}` usa o PNCP real e os limites padrão. O arquivo é público.

Publique **todo o conteúdo de `dist-browser/`**, incluindo `assets/`. Os caminhos relativos permitem servir na raiz ou em um diretório como `/contratos-web/`; abra a URL do diretório com barra final. A hospedagem precisa fornecer MIME apropriado: `text/javascript` para módulos e Worker, `text/css` e `application/json`. Use HTTPS; a abertura por `file://` não é suportada.

Links de pesquisa usam parâmetros no mesmo caminho, por exemplo `/contratos-web/?tipos_documento=ata&pagina=2`. O servidor entrega o HTML, e a interface lê os critérios. Rotas `/api/...` são chamadas diretamente no PNCP; a hospedagem não precisa de reescrita para essas rotas.

## GitHub Pages

O workflow [`static-pages.yml`](../.github/workflows/static-pages.yml) executa em cada push para `main` e por `workflow_dispatch`. O job `build` usa Node.js 24, instala com `npm ci`, executa `npm test`, compila e envia `dist-browser/` como artefato. O job `deploy` publica no ambiente `github-pages`. Os testes de navegador são executados separadamente, conforme [Validação](validacao.md).

Para configurar uma publicação:

1. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
2. Envie um commit à `main` ou execute **Actions → Publicar versão estática → Run workflow**.
3. Confira o resultado do job `deploy` e a URL informada por ele.
4. Para usar domínio próprio, configure **Custom domain** no Pages, os registros DNS correspondentes e HTTPS.

Sem domínio próprio, um repositório de projeto usa um caminho como `/contratos-web/`. A conta pode exigir aprovação do ambiente `github-pages`; a configuração do workflow concede as permissões de Pages e identidade necessárias à publicação.

O GitHub Pages não interpreta `_headers`. A CSP e a política de referrer do HTML são aplicadas; cabeçalhos HTTP adicionais e controle de cache dependem do provedor.

## Outros provedores e cabeçalhos

Em provedores como Cloudflare Pages, use comando de build `npm run build`, saída `dist-browser` e Node.js 24 para o build. Em Nginx, Apache ou outro servidor, sirva os mesmos arquivos com MIME correto.

O build gera `_headers` com a política de segurança definida em [`vite.config.js`](../vite.config.js):

- Scripts e Worker da própria origem; conexões à própria origem e a `https://pncp.gov.br`.
- `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer`.
- `Cache-Control: no-cache` para os arquivos e cache imutável de um ano para `/assets/*`.

Provedores que aceitam `_headers` podem aplicá-lo diretamente na raiz. Em subdiretórios, ajuste a regra de assets para o prefixo publicado. Nos demais servidores, configure cabeçalhos equivalentes. A CSP em `<meta>` não substitui `frame-ancestors 'self'` nem os cabeçalhos da resposta do Worker.

O acesso às APIs exige CORS autorizado pelo PNCP. O transporte usa GET sem credenciais e sem seguir redirecionamentos.

## Verificar e atualizar

Abra `pncp-diagnostic.html` no domínio publicado para conferir o acesso real ao PNCP. O [guia de validação](validacao.md#diagnóstico-do-pncp) explica a matriz de consultas e como salvar o resultado. Confira também busca, links compartilhados, painéis, paginação e CSV nos navegadores usados pelo público.

Atualize HTML, configuração e bundles como um conjunto. Os assets têm nomes com hash; preserve os anteriores temporariamente quando o provedor permitir, para atender abas abertas. HTML e configuração devem ser revalidados. Depois da publicação, abra uma nova aba e repita uma pesquisa.

Para restaurar uma publicação, use HTML, configuração e bundles de um mesmo artefato aprovado, mantendo seus nomes e caminhos, e verifique a aplicação novamente.
