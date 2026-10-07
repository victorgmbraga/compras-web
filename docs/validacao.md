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
- Arquivos, atas, contratos/empenhos e histórico: rotas oficiais, contagens, HTTP 204, links, valores exatos, carregamento sob demanda, paginação independente, nova tentativa e cancelamento.
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

Confira HTTP 200, `status: "ok"` no healthcheck e `source` correspondente ao modo escolhido. Na pesquisa, confira `data`, totais e paginação. Em demonstração, a pesquisa por `firewall` retorna seis contratações; a pesquisa sem texto retorna 64 contratações ou 32 contratos. Com a fonte real, os resultados e totais variam.

Pela interface, verifique pesquisa inicial, todos os filtros, paginação, itens, troca entre contratações e contratos, cancelamento e CSV de ambos os tipos. Expanda as quatro listagens nos detalhes de uma contratação e confira downloads, acesso a atas/contratos e páginas de arquivos/histórico. Confira também a identificação de erro sem perda silenciosa do resultado anterior. O [contrato da API](consultas-pncp.md) inclui exemplos de detalhes, sugestões e exportação.

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

Revisão atual: 7 de outubro de 2026, Linux, Node.js 24.19.0.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 132 testes passaram, sem falhas ou testes ignorados |
| Build e distribuição em demonstração | Build concluído; saúde, esquema, estáticos, pesquisa, domínios, sugestões, itens, quatro listagens dos detalhes e CSV dos dois tipos verificados |
| Chromium com Playwright 1.58.2 | 47 verificações passaram, incluindo todos os 71 controles de contratações e os 32 de contratos, quatro listagens dos detalhes, paginação, status, CSV e responsividade; sem erros JavaScript não tratados |
| Catálogo | 80 filtros implementados, 71 de edital e 32 de contrato; nenhum filtro pendente |
| Integração real | Respostas válidas para as quatro listagens de detalhes, incluindo duas páginas de atas, além de parte dos filtros e contratos; outras chamadas receberam HTTP 503. O alcance dos filtros está no respectivo guia |

A cobertura funcional verifica todos os filtros na pesquisa e na exportação, tipos e intervalos inválidos antes da rede, pertinência aos domínios, IDs alfabéticos, espaços em unidades, zeros à esquerda, ausência distinta de false e precisão decimal além da faixa segura de inteiros. Contratos têm projeção e CSV próprios; o sequencial do contrato não inicia consultas de itens de uma compra.

Os testes de interface verificam edição de Não, reconciliação legal, status e colunas por documento, limpeza de critérios ao trocar de tipo e descarte de respostas atrasadas. A demonstração preserva todos os itens nos detalhes e mantém uma linha por documento no CSV. O navegador percorre os controles completos, aplica combinações e baixa arquivos dos dois tipos.

As quatro listagens de detalhes foram verificadas nos serviços reais usados pelo portal oficial: arquivos e histórico de `00394452000103-1-021678/2026`, contrato vinculado à contratação `18629840000183-1-000051/2026` e 11 atas em duas páginas de `88585518000185-1-000469/2026`. A conferência incluiu formatos, contagens, campos e URLs retornadas pela API da aplicação. Ela não baixou o conteúdo binário dos arquivos nem certifica disponibilidade contínua da fonte.

As sondagens externas verificam respostas e controles selecionados, sem homologar todos os predicados e combinações. O formulário oficial do PNCP confirmou o uso do ID do catálogo de países, o catálogo de situações de resultados e os status vigente/nao_vigente. Falhas intermitentes impedem afirmar disponibilidade contínua ou correlação no mesmo item/resultado. Consulte [Implementação e verificação dos filtros](viabilidade-filtros-pncp.md).
