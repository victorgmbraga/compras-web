# Testes e validação

Execute os comandos na raiz do repositório com Node.js 22.9 ou superior e as dependências instaladas por `npm ci`. Node.js 24 é recomendado.

## Suíte automatizada

```sh
npm test
```

O comando usa `node --test --test-concurrency=1 test/*.test.js`. A suíte cobre:

- Contrato HTTP, capacidades, tipos, datas, intervalos e serialização dos filtros.
- Identificadores, projeção documental, precisão numérica e normalização de links.
- Paginação remota, totais, janela de resultados e consistência da exportação.
- Quantidade, paginação, campos e falhas dos itens.
- Cancelamento, timeouts, tentativas e orçamentos de recursos.
- Handlers da interface com DOM mínimo, controle de respostas atrasadas e recuperação de erros.
- Filtros documentais, enumerações singulares, catálogos auxiliares, domínios parciais e reconciliação de normativos/amparos.
- Reinício e recarga automática no desenvolvimento.

As respostas externas são sintéticas. A suíte verifica o comportamento da aplicação, mas não comprova disponibilidade do PNCP nem a renderização completa em navegador. O script `test/ui-smoke.mjs` é uma verificação separada.

## Verificação HTTP

Inicie `npm run demo` para validar o fluxo local com a fonte sintética ou `npm start` para validar o acesso real. Em outro terminal:

```sh
curl --fail-with-body -sS http://localhost:8000/api/health
curl --fail-with-body -sS http://localhost:8000/api/schema
curl --fail-with-body -sS http://localhost:8000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"api_version":"2.0","q":"firewall","size":10}'
```

Confira HTTP 200, `status: "ok"` no healthcheck e `source` correspondente ao modo escolhido. Na pesquisa, confira `data`, totais e paginação. Em demonstração, a pesquisa por `firewall` retorna seis documentos; a pesquisa sem texto retorna total 64. Com a fonte real, os resultados e totais variam.

Pela interface, verifique pesquisa inicial, filtros, paginação, abertura de itens, cancelamento e CSV. Confira também a identificação de erro sem perda silenciosa do resultado anterior. O [contrato da API](consultas-pncp.md) inclui exemplos de sugestões e exportação.

## Build e distribuição

```sh
npm run build
cd dist
npm ci --omit=dev
npm run demo
```

O build recria `dist/` e copia código, documentação e arquivos de execução. Ele não compila o frontend nem executa testes. Pare o servidor anterior ou use outra porta antes de iniciar a distribuição. Repita as verificações HTTP a partir do processo distribuído, incluindo o carregamento de `/` e `/vendor/tabulator.min.js`.

## Navegador

O teste opcional [`test/ui-smoke.mjs`](../test/ui-smoke.mjs) requer Playwright e Chromium. Ele cria seu próprio servidor temporário com fonte sintética. Para preparar as ferramentas sem mudar as dependências do projeto, em um terminal POSIX:

```sh
QA_DIR="$(mktemp -d)"
npm install --prefix "$QA_DIR" --no-package-lock playwright@1.58.2
"$QA_DIR/node_modules/.bin/playwright" install chromium
COMPRAS_QA_PLAYWRIGHT_MODULE="$QA_DIR/node_modules/playwright/index.mjs" \
  node test/ui-smoke.mjs
```

O sistema operacional também precisa das bibliotecas exigidas pelo navegador. `COMPRAS_QA_PLAYWRIGHT_MODULE` aceita o caminho do módulo Playwright instalado fora do projeto. Para um binário gerenciado pelo ambiente, o script oferece `COMPRAS_QA_CHROMIUM_MODULE` (módulo cujo export padrão fornece `executablePath()`) e `COMPRAS_QA_CHROMIUM_EXECUTABLE` (caminho explícito, usado junto desse módulo). Quando o módulo de Chromium é usado, o script adiciona os argumentos de execução para ambiente isolado. `COMPRAS_QA_SCREENSHOT_DIR` permite salvar capturas em um diretório existente.

O script verifica pesquisa, paginação, detalhes, CSV, filtros e outros cenários de interface. Considere a execução aprovada apenas quando ele concluir com código zero e emitir o resumo final. Verificações posteriores a uma falha não foram executadas.

## Medição local

```sh
npm run benchmark:demo
```

O comando escreve um JSON na saída com duração, quantidade de linhas, chamadas, tamanho do CSV e memória RSS para pesquisa, paginação e exportação. Ele usa fonte sintética e ritmo de chamadas elevado para medir processamento local. Não representa latência ou capacidade do PNCP. Guarde saídas e capturas fora dos arquivos versionados de documentação.

## Situação verificada e alcance

Revisão atual: 6 de outubro de 2026, Linux, Node.js 24.19.0.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 105 testes passaram, sem falhas ou testes ignorados |
| Build e distribuição em demonstração | Build concluído; saúde, esquema, arquivos estáticos, pesquisa, filtros, sugestões, itens e CSV verificados |
| Pesquisa real por `firewall`, tamanho 10 | HTTP 200, fonte `pncp` e dez documentos |
| Benchmark de demonstração | Pesquisa, paginação e exportação concluídas |
| Teste de navegador com Playwright 1.58.2 e Chromium do ambiente | 33 verificações passaram, incluindo filtros documentais e de itens combinados, edição de Não, detalhes sem refinamento, CSV, SRP, IBGE, reconciliação legal e responsividade; sem erros JavaScript não tratados |
| Filtros documentais na fonte real | Sondagens válidas conferiram todos os registros das páginas para os treze filtros liberados; exigência de conteúdo nacional com `true` teve um registro, e as demais páginas tinham dez |
| Novos filtros pela API real da aplicação | Orçamento sigiloso `false`, ata vinculada `false` e modo de disputa `5` retornaram HTTP 200 com dez registros correspondentes; sistema de origem `3` retornou HTTP 503 nessa verificação |
| Emenda parlamentar pela API real | Condição `false` com órgão, unidade e ano retornou HTTP 200 e cinco registros correspondentes; CSV HTTP 200 com cinco contratações |
| Seis filtros de itens na fonte real | Respostas válidas da busca e detalhes confirmaram controles de critérios, categorias, benefícios, incentivo e margens. Buscas pela API da aplicação de critério, benefício e margem adicional tiveram HTTP 503 na rodada |
| Catálogos pela API da aplicação | Países, portes e naturezas jurídicas responderam HTTP 200 |

Os filtros documentais liberados possuem testes de valores únicos e múltiplos, booleanos, formato IBGE, pertencimento a domínios, consulta e CSV. A dependência legal tem testes de preservação e remoção de amparos, bloqueio durante a conferência, falha, repetição e descarte de respostas atrasadas. Há também testes de códigos de transporte numéricos para que uma falha de proxy seja apresentada como erro de transporte.

Origem e modo de disputa têm testes de união de opções e validação compartilhada dos domínios antes da busca e do CSV. Orçamento sigiloso, ata vinculada, contrato/empenho vinculado, nota fiscal do contrato e conteúdo nacional distinguem omissão, `true`, `false` e `null` na demonstração. A cobertura verifica combinações, segunda página, coleta completa, rejeição de entradas inválidas e edição/remoção pela interface. O teste Chromium confirma a consulta dos sete novos filtros combinados e o download das onze contratações correspondentes.

Emenda e os seis filtros de itens têm cobertura de domínios, aliases, tipos inválidos, omissão, booleanos e exportação. A demonstração mantém dois itens por contratação. Os testes verificam que os detalhes preservam itens não correspondentes, que o CSV exporta contratações e que a busca/exportação não consultam itens automaticamente. No Chromium, a combinação dos sete filtros retorna seis contratações, os detalhes continuam com dois itens e o CSV contém seis linhas de dados. Os ensaios reais confirmam controles individuais; a correlação de condições distintas no mesmo item permanece sem homologação.

As respostas do PNCP foram intermitentes: depois das sondagens válidas, várias consultas pela API da aplicação receberam indisponibilidade ou timeout, inclusive com critérios mais restritos. Os testes sintéticos não garantem disponibilidade contínua nem todas as combinações possíveis na fonte. O [planejamento dos filtros](viabilidade-filtros-pncp.md) registra os campos e valores conferidos e o que ainda precisa ser comprovado.
