# Viabilidade de execução no navegador

Avaliação de 8 de outubro de 2026, sobre o commit `2b24593`.

## Parecer

**É tecnicamente viável transformar o Compras Web em uma aplicação estática, sem backend próprio em execução.** O projeto não usa banco de dados, autenticação própria ou credenciais privadas para acessar o PNCP. As respostas bem-sucedidas das duas famílias de APIs utilizadas apresentaram `Access-Control-Allow-Origin: *`, incluindo pesquisas de contratações, atas e contratos.

A migração exige trabalho de porte moderado: mover o serviço de consultas para o navegador, adaptar as dependências do Node.js e gerar uma distribuição estática. A interface e grande parte das regras de negócio podem ser reaproveitadas. A validação direta no domínio HTTPS de destino permanece necessária antes de substituir a implantação atual.

O navegador continuará dependendo das APIs e da disponibilidade do PNCP para obter dados reais. HTML, CSS, JavaScript e bibliotecas poderão ser publicados em uma hospedagem estática HTTPS, como GitHub Pages ou Cloudflare Pages. Node.js poderá continuar sendo usado para desenvolvimento, testes e build, sem ser necessário na hospedagem da aplicação.

O destino recomendado é uma página servida por HTTP(S). A abertura direta de `index.html` por `file://` tem restrições próprias de origem e módulos e precisaria de uma avaliação separada. Dados reais atualizados continuam exigindo conexão com a internet.

**Este documento é uma avaliação e uma proposta. A versão atual ainda exige o servidor Node.js; `npm run build` ainda produz uma distribuição Node.js.**

## Evidência de acesso ao PNCP

Foram feitas requisições HTTPS reais, com verificação TLS ativa, `Origin: https://compras-web.example`, `Accept: application/json` e os mesmos caminhos usados pela aplicação. Os cabeçalhos e resultados resumidos estão em [Evidências de acesso e CORS](evidencias-browser-pncp.json).

| Família e recurso verificado | Resultado observado | Acesso por outra origem |
| --- | --- | --- |
| `/api/search/`, tipo `edital`, texto `software` | HTTP 200, 10 documentos | `Access-Control-Allow-Origin: *` |
| `/api/search/`, tipo `ata`, texto `software` | HTTP 200, 10 documentos | `Access-Control-Allow-Origin: *` |
| `/api/search/`, tipo `contrato`, texto `software` | HTTP 200, 10 documentos | `Access-Control-Allow-Origin: *` |
| `/api/search/filters` e `/api/search/suggest` | HTTP 200 em tentativas bem-sucedidas | `Access-Control-Allow-Origin: *` |
| `/api/pncp/v1/paises` | HTTP 200, catálogo JSON | `Access-Control-Allow-Origin: *` |
| Itens, quantidade, arquivos, histórico e atas de uma contratação | HTTP 200 | `Access-Control-Allow-Origin: *` |
| Dados completos, partes envolvidas e contratos de uma ata | HTTP 200 | `Access-Control-Allow-Origin: *` |
| Dados completos de contrato, termos, quantidade de termos e instrumentos de cobrança | HTTP 200 | `Access-Control-Allow-Origin: *` |
| Contratos vinculados a uma contratação sem registros | HTTP 404, corpo JSON | `Access-Control-Allow-Origin: *` |

O portal oficial usa as APIs na mesma origem. Sua existência como aplicação de navegador, por si só, não demonstraria que outro site pode consumi-las; os cabeçalhos acima são a evidência relevante para essa possibilidade.

### Alcance do teste em navegador

A tentativa de conexão direta do Chromium ao PNCP encontrou `ERR_CERT_AUTHORITY_INVALID` para o proxy do ambiente de avaliação. A verificação TLS foi mantida ativa, e essa tentativa ficou inconclusiva quanto ao acesso direto por navegador.

Para verificar o comportamento de CORS separadamente, respostas HTTPS reais foram reproduzidas por um servidor de teste em uma origem local diferente da página, preservando os cabeçalhos CORS e o corpo. O Chromium realizou requisições de rede normais, sem interceptação do Playwright e sem desativar a segurança. Um controle com `Access-Control-Allow-Origin: *` permitiu ler o JSON; outro sem esse cabeçalho foi bloqueado. Respostas reais de busca de atas, filtros, sugestões, catálogo, detalhes de ata/contrato e HTTP 404 também puderam ser lidas quando continham CORS válido.

Esse teste confirma o efeito dos cabeçalhos observados, mas não substitui uma consulta direta ao PNCP a partir da futura hospedagem HTTPS. Não houve homologação de todos os 80 filtros, de todos os recursos dos painéis ou de uma exportação completa no navegador.

Também foram observadas respostas HTTP 503 sem cabeçalhos CORS no caminho de acesso. A origem dessas falhas, entre a API e a infraestrutura intermediária, não foi estabelecida. O teste isolado confirmou que o navegador bloqueia a leitura dessas respostas: a aplicação recebe uma falha de `fetch`, sem conseguir distinguir o HTTP 503 de outros problemas de transporte. Isso precisa ser considerado no tratamento de erros da versão estática.

## O que muda na arquitetura

Hoje, [`public/app.js`](../public/app.js) consulta `/api/schema`, `/api/query`, `/api/export` e rotas locais de filtros e detalhes. O servidor valida, acessa o PNCP e devolve dados já projetados. Publicar apenas `public/` em um serviço estático não faria essas funções operarem.

A arquitetura proposta é:

```mermaid
flowchart LR
    Static[Hospedagem estática HTTPS] --> Browser["Navegador: interface e serviço de consultas"]
    Browser --> Search[API Search do PNCP]
    Browser --> Details[API PNCP v1]
    Browser --> CSV["CSV local: Blob e download"]
```

| Componente atual | Adaptação necessária |
| --- | --- |
| Interface, Tabulator, abas, contadores e paginação | Preservar a interface e substituir chamadas `/api/...` por métodos de um serviço JavaScript local. |
| [`src/schema.js`](../src/schema.js) e catálogo de argumentos | Gerar esquema estático ou incluí-lo no bundle. Preservar colunas, tipos, limites e compatibilidade dos 80 filtros. |
| [`src/validation.js`](../src/validation.js), [`src/filter-domains.js`](../src/filter-domains.js) e [`src/errors.js`](../src/errors.js) | Reaproveitar as regras. A validação local continua conferindo domínios obtidos do PNCP. |
| [`src/adapter.js`](../src/adapter.js), [`src/related.js`](../src/related.js) e [`src/document-details.js`](../src/document-details.js) | Reaproveitar projeções, identidades, campos por tipo e validação de links. Incluir `lossless-json` na distribuição. |
| [`src/pncp.js`](../src/pncp.js) | Trocar Undici e seus agentes por `fetch` nativo; adaptar leitura, identificação de operações, timeouts, redirecionamentos e erros. |
| [`src/query.js`](../src/query.js) | Executar no navegador, preservando filtros, paginação e conferências de consistência; adaptar a produção do CSV. |
| [`src/demo.js`](../src/demo.js) | Incluir os dados sintéticos e uma configuração explícita de demonstração. |
| [`src/config.js`](../src/config.js) | Substituir `process.env` por configuração pública de build ou arquivo estático. |
| [`src/server.js`](../src/server.js) e [`scripts/build.js`](../scripts/build.js) | Criar um build que entregue apenas assets estáticos. Rotas HTTP, logs do processo e healthcheck deixam de fazer parte dessa implantação. |

As APIs HTTP próprias da aplicação não estarão disponíveis em uma hospedagem estática. Se houver integrações externas dependentes de `/api/query` ou `/api/export`, elas precisarão de adaptação ou da manutenção de uma distribuição Node.js separada.

## Adaptações que precisam preservar o comportamento

### Cliente HTTP e segurança

- Usar `GET` nas APIs do PNCP, com `credentials: 'omit'` e cabeçalhos simples, como `Accept`. Os atuais `POST` são destinados ao servidor local, não à busca do PNCP.
- Remover os cabeçalhos personalizados `User-Agent` e `Cache-Control` do cliente atual. O navegador controla o primeiro; o segundo provoca preflight, e não consta na lista de cabeçalhos permitidos observada na API v1. `Access-Control-Allow-Origin: *` exige que a consulta não envie credenciais.
- Substituir `node:crypto`, `Buffer` e `timeout.unref()` por APIs do navegador: `crypto.randomUUID()`, `TextDecoder`, `TextEncoder` e temporizadores comuns. Manter cancelamento e limites de volume durante a leitura da resposta.
- Adaptar a verificação de redirecionamentos. Com `redirect: 'manual'`, o navegador pode retornar `opaqueredirect`, sem expor `Location`. Uma opção conservadora é usar os caminhos canônicos com `redirect: 'error'` e tratar redirecionamentos como falhas.
- Manter tentativas limitadas com espera progressiva. `Retry-After` não fica acessível ao JavaScript sem `Access-Control-Expose-Headers`; esse cabeçalho de exposição não apareceu nas respostas verificadas. Usar uma espera local quando a indicação da fonte não puder ser lida.
- Ajustar a política de conteúdo para permitir `connect-src 'self' https://pncp.gov.br`. A política atual permite apenas `'self'`. Se houver Worker, permitir seu carregamento da própria origem. Continuar exibindo textos da fonte como texto e validando links.

O navegador não consegue corrigir uma resposta sem CORS. Se o PNCP mudar sua política de acesso, uma implantação totalmente estática dependerá de uma correção na fonte. Acrescentar um proxy ou função serverless criaria novamente um backend próprio.

### Precisão numérica e exportação

`lossless-json` possui distribuição para navegador. Sua utilização deve ser mantida: primeiro ler o corpo como texto, depois interpretar os números com esse parser. Usar diretamente `response.json()` nos dados financeiros pode arredondar valores antes que os adaptadores os convertam para texto.

A coleta e a geração de CSV podem ser feitas localmente, com `TextEncoder` para medir bytes e `Blob` para iniciar o download. Preservar todas as colunas documentais, BOM UTF-8, CRLF, escape de aspas, valores exatos e os últimos critérios concluídos. Manter as verificações de total alterado, página incompleta e documentos duplicados.

Recomenda-se um Web Worker para interpretação de respostas e exportações maiores, mantendo a interface responsiva e oferecendo progresso e cancelamento. O padrão atual de 10.000 documentos, com páginas de 50, pode exigir 200 requisições de busca, além da validação de domínios. O limite de CSV é 50 MiB, mas documentos, strings e cópias podem consumir mais memória que o arquivo final. Esses limites e o timeout total precisam de verificação em dispositivos móveis e abas em segundo plano.

### Filtros e painéis dos três tipos

A migração deve manter os 80 filtros implementados, com sua compatibilidade por documento, serialização e validação de domínios. Ela não exige refazer o catálogo nem substituir a API Search pela API de consulta pública, cujos recursos não devem ser presumidos equivalentes.

Preservar os painéis de contratações, atas e contratos, o carregamento inicial em segundo plano, as contagens separadas, envelopes paginados, recorte local de instrumentos de cobrança e consultas sob demanda de registros filhos. Também manter as identidades distintas: compra e ata possuem sequenciais próprios; um contrato não fornece o sequencial da compra por equivalência.

**HTTP 404 continua significando zero registros somente na consulta de contratos vinculados à contratação**, conforme o comportamento atual. A resposta verificada permite ler esse status por CORS. Uma falha genérica de rede ou CORS não pode ser convertida em lista vazia, e outros HTTP 404 não devem receber essa exceção automaticamente.

### Limites e operação

A fila, o ritmo de duas chamadas por segundo e a concorrência de duas requisições podem ser mantidos por instância da aplicação. O backend atual coordena todos os clientes de seu processo; no navegador, abas e usuários passam a ter filas independentes. Essa mudança deve ser considerada ao abrir várias abas ou usar redes com IP compartilhado. Coordenação por `BroadcastChannel` ou SharedWorker pode ajudar entre abas da mesma origem, mas não oferece controle global entre usuários.

O diagnóstico de disponibilidade passa a depender das consultas e das mensagens da interface. A versão estática não terá `/api/health` nem os logs centralizados do servidor. A configuração entregue ao navegador será pública; o acesso atual ao PNCP não precisa de segredos.

## Caminho recomendado

1. **Validar uma página estática HTTPS na hospedagem de destino.** Consultar diretamente busca dos três tipos, filtros, sugestões, catálogos, contagens, listagens e registros filhos. Conferir também o tratamento de HTTP 404 e 204 e de indisponibilidade, em Chromium, Firefox e Safari, com a segurança padrão habilitada.
2. **Extrair o núcleo reutilizável e criar o transporte de navegador.** Separar regras de negócio das dependências Node.js, preservar os testes existentes do núcleo e conectar a interface ao serviço local.
3. **Migrar exportação e demonstração.** Implementar CSV local, progresso e cancelamento; medir tempo e memória em uma coleta maior e em dispositivo móvel.
4. **Criar o build estático.** Incluir Tabulator, `lossless-json` e assets locais. Ajustar caminhos absolutos como `/app.js`, `/vendor/...` e `/favicon.svg` para publicação em subdiretórios, como `/compras-web/` no GitHub Pages. Configurar CSP na hospedagem ou no HTML, conforme os recursos oferecidos.
5. **Publicar após verificar equivalência.** Conferir filtros, ordenação, paginação, precisão numérica, CSV, detalhes completos, abertura das abas em segundo plano, cancelamento e ausência de chamadas às antigas rotas `/api/...` da aplicação.

O primeiro passo é a condição para confirmar a migração em produção. A evidência atual favorece uma aplicação estática e o código permite reaproveitamento significativo, mas ainda não demonstra equivalência completa de funcionamento no navegador.

## Como repetir uma checagem direta

Em uma página estática HTTPS de origem diferente de `pncp.gov.br`, com uma política de conteúdo que permita a conexão, execute no console do navegador:

```js
const url = 'https://pncp.gov.br/api/search/?tipos_documento=ata&status=todos&ordenacao=-data&pagina=1&tam_pagina=10&q=software';
const response = await fetch(url, {
  mode: 'cors',
  credentials: 'omit',
  headers: { Accept: 'application/json' },
});
console.log(response.status, response.type, response.headers.get('content-type'));
const body = await response.text();
console.log(body.slice(0, 160));
```

Uma resposta JSON legível com `response.type === 'cors'` comprova o acesso àquele endpoint naquela tentativa. Repetir com outros tipos e recursos é necessário; apenas um resultado positivo não homologa a integração inteira. O trecho acima inspeciona texto; o serviço da aplicação deve usar `lossless-json` para interpretar números.
