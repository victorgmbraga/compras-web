# Testes e validação

Execute os comandos na raiz com Node.js 22.12 ou superior (Node.js 24 recomendado) e dependências instaladas por `npm ci`. Playwright 1.58.2 e Vite 8.3.4 estão fixados no projeto/lockfile.

## Núcleo, adaptadores e interface

```sh
npm test
```

O runner nativo executa `test/*.test.js`. A suíte cobre filtros dos três tipos em pesquisa/CSV, precisão, validação antes da rede, domínios, paginação, identidades e painéis. Inclui API HTTP e interface com DOM mínimo, além de serviço portável do navegador e ponte RPC.

Os testes de navegador do runtime verificam configuração pública, transporte sem credenciais, UTF-8 dividido entre chunks, números acima de 2^53, ausência distinta de false, 204/404/429/503, erros opacos/JSON, tentativas, timeouts, orçamentos, cancelamento de leitura/fila/CSV, excesso de operações, prazo absoluto, respostas fora de ordem, reinicialização e versão do Worker. CSVs dos três tipos são comparados byte a byte com Node.js, incluindo limite exato, BOM, CRLF, aspas e acentos; metadados do navegador não contêm a coleção de documentos.

Essa suíte usa fontes controladas, sem provocar falhas ou limitação no PNCP real. Ela não comprova a disponibilidade externa. O DOM mínimo não substitui renderização em navegador.

## Testes em navegador real

Instale os navegadores necessários uma vez:

```sh
npx playwright install chromium firefox
npm run test:browser
npm run test:ui
```

`test:browser` compila um build de testes em `dist-browser-test/`, com provedor sintético no próprio Worker, e serve somente arquivos. Percorre todos os controles de filtros, buscas, colunas, paginação, três painéis, registros filhos, CSV, progresso/cancelamento, respostas atrasadas, XSS como texto, teclado e responsividade. Verifica ausência de chamadas `/api/...` à hospedagem.

Depois compila **o build de produção** em `dist-browser/`, verifica seus assets e Worker na raiz e em `/compras-web/`, e inspeciona bundles para dependências de Node, variáveis do processo e fixtures indevidas. As fixtures de falha/volume não são incluídas em produção.

Dois servidores de origem controlada conferem CORS por requisições normais: controle positivo, negativo sem permissão e exposição de `Retry-After`. Não há interceptação de respostas ou segurança de origem/TLS desativada. Esse ensaio verifica o mecanismo do navegador, separado das chamadas reais ao PNCP.

O teste também exporta 10.000 documentos no Worker, mede tempo/bytes/chamadas e usa um temporizador da interface para conferir que ela continua recebendo eventos. Cancela uma segunda coleta no progresso e verifica uma pesquisa seguinte. A medição de memória total do Worker/Blob não está disponível nesse ensaio e é identificada como indisponível.

`test:ui` cria a aplicação Node.js com fonte sintética e verifica o mesmo layout/fluxos através do adaptador HTTP. Esse modo permite cancelar CSV, mas não transmite progresso por páginas pela API HTTP existente.

Para repetir a versão estática em Firefox:

```sh
COMPRAS_QA_BROWSER=firefox npm run test:browser
```

`COMPRAS_QA_BROWSER` aceita `chromium` (padrão), `firefox` e `webkit`; WebKit não substitui Safari real. O sistema precisa das bibliotecas dos navegadores. `COMPRAS_QA_BROWSER_EXECUTABLE` aceita um binário instalado no ambiente. `COMPRAS_QA_CHROMIUM_EXECUTABLE`, `COMPRAS_QA_CHROMIUM_MODULE` e `COMPRAS_QA_PLAYWRIGHT_MODULE` mantêm compatibilidade com instalações externas. `COMPRAS_QA_SCREENSHOT_DIR` salva capturas em um diretório já existente.

Em ambientes gerenciados, preserve proxy e confiança TLS. Use perfis temporários; não altere confiança compartilhada nem contorne CORS/TLS para declarar integração aprovada. Limitações de inicialização devem ser registradas separadamente. Considere a execução aprovada somente quando terminar com código zero e emitir o resumo final.

## Build e execução

```sh
npm run build:browser
npm run preview:browser
```

Abra `http://localhost:8000` para consultas reais e `/?demo=1` para demonstração explícita. Teste também `npm run demo:browser` no desenvolvimento. As consultas sintéticas iniciais retornam 64 contratações, 24 atas e 32 contratos; `firewall` retorna seis contratações.

A alternativa Node.js continua sendo gerada e executada assim:

```sh
npm run build
cd dist
npm ci --omit=dev
npm run demo
```

Use outra porta se necessário. Verifique `/`, módulos da interface, `/api/health`, `/api/schema`, pesquisa e CSV dos três tipos. Saúde confirma o processo, sem certificar acesso ao PNCP.

## Diagnóstico da integração real

Sirva o build final e abra `pncp-diagnostic.html`. Execute **Verificar acesso** e **Salvar evidência**. O diagnóstico consulta diretamente o PNCP na página e no Worker, registra origem/data/navegador, status e cabeçalhos legíveis de uma consulta da página e resultados tipados da matriz de recursos. Inclui pesquisas dos três tipos, página seguinte, ordenação/UF, filtros, sugestões, quatro catálogos auxiliares, detalhes e registros filhos. Exemplos públicos são fixos, com filhos escolhidos da listagem quando disponíveis.

Repita na origem HTTPS publicada em Chromium, Firefox e Safari, incluindo dispositivo móvel real e retomada de aba suspensa. Registros ausentes/404 não homologam uma amostra positiva; listas vazias legítimas e falhas são resultados distintos. A exceção 404 de contratos vinculados à contratação não se aplica a empenhos de contrato ou arquivos de termo. Respostas sem CORS não oferecem necessariamente status HTTP ao JavaScript.

## Resultado verificado

Medições de 8 de outubro de 2026, Linux, Node.js 24.19.0, Chromium 151 e Firefox 146.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 172 testes passaram, sem falhas/ignorados; inclui 17 novos testes de runtime/RPC/CSV do navegador |
| Interface Node.js em Chromium | 62 verificações, com API de referência e cancelamento CSV |
| Interface estática em Chromium | 63 verificações, todos os 71/16/32 controles, painéis e CSV, sem API local ou erro JavaScript não tratado |
| Interface estática em Firefox | 63 verificações equivalentes |
| Artefato e CORS em Chromium/Firefox | Build de produção na raiz e subdiretório, assets/Worker locais, controle CORS negativo e cabeçalhos expostos; bundles sem dependências Node ou fixtures de teste |
| Exportação sintética no Worker | 10.000 documentos, 100 chamadas/páginas, 4.264.313 bytes; aproximadamente 3,2 s no Chromium e 1,5 s no Firefox nas medições locais; cancelamento após primeira página e pesquisa posterior concluída |
| Build Node.js distribuído | Estáticos, módulos, API, pesquisa e CSV dos três tipos passaram com dependências de produção |
| Vite de desenvolvimento | Demonstração abriu, Worker pesquisou e não houve erro JavaScript não tratado |
| PNCP direto no Firefox | 32 operações da matriz: 29 concluídas e três HTTP 404 legíveis; consulta da página HTTP 200 com JSON/CORS legível |

A medição externa está em [`evidencias-browser-implementacao.json`](evidencias-browser-implementacao.json). Ela usa a distribuição estática, origem localhost, fetch nativo e TLS ativo, sem API de aplicação ou interceptação. O proxy de rede do ambiente permaneceu configurado; sua CA foi confiada apenas no perfil temporário. O Firefox precisou executar fora do isolamento de processos para inicializar, preservando segurança de origem e TLS.

O registro confirma acesso direto a buscas, domínios, catálogos, sugestões e principais recursos dos painéis. Empenhos e arquivos de termo retornaram 404 nas amostras; seus registros positivos são cobertos por fixtures. Os exemplos de vínculos incluíram atas e contrato existentes. Essas respostas e totais são observações daquela data, sujeitos a mudanças do PNCP.

As durações sintéticas usam ritmo elevado para medir processamento, sem representar latência do PNCP. Os padrões de 50 registros por página, duas chamadas por segundo e 120 segundos podem interromper uma coleta real de 10.000 registros. Limites por byte foram conferidos em fronteiras exatas, sem remover orçamentos.

A origem HTTPS de produção, Safari e dispositivo móvel real ainda não foram homologados. Viewports móveis e prazos conferidos após retomada não certificam suspensão física do dispositivo. A promoção e o retorno estão em [Hospedagem estática](hospedagem-estatica.md) e no [plano](plano-implementacao-browser.md).
