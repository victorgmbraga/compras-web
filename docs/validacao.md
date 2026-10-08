# Testes e validação

Execute os comandos na raiz com Node.js 22.12 ou superior (Node.js 24 recomendado) e dependências instaladas por `npm ci`. Playwright 1.58.2 e Vite 8.3.4 estão fixados no projeto/lockfile.

## Núcleo e interface

```sh
npm test
```

O runner nativo executa `test/*.test.js`. A suíte cobre filtros dos três tipos em pesquisa/CSV, precisão, validação antes da rede, domínios, paginação, identidades e painéis. Inclui interface com DOM mínimo, núcleo do navegador e ponte RPC. Os mocks de interface recebem métodos e payloads tipados, sem adaptador HTTP.

O cache de opções tem testes de pré-carga dos três tipos e catálogos compartilhados, reutilização por campo e entre inicializações, expiração exata em 4 horas (memória e `localStorage`), entradas inválidas, armazenamento bloqueado/sem quota, falhas sem persistência, deduplicação e cancelamento por leitor. Também cobre amparos por conjunto de normativos, separação entre fonte real/demonstração e inicialização da tabela sem aguardar uma pré-carga lenta. O smoke no navegador verifica a persistência real, reutilização em nova página, reabertura dos filtros e renovação após vencimento sem apagar dados alheios.

Os testes de navegador do runtime verificam configuração pública, transporte sem credenciais, UTF-8 dividido entre chunks, números acima de 2^53, ausência distinta de false, 204/404/429/503, erros opacos/JSON, tentativas, timeouts, orçamentos, cancelamento de leitura/fila/CSV, excesso de operações, prazo absoluto, respostas fora de ordem, reinicialização e versão do Worker. CSVs dos três tipos são comparados byte a byte com o núcleo, incluindo limite exato, BOM, CRLF, aspas e acentos; metadados do navegador não contêm a coleção de documentos.

Essa suíte usa fontes controladas, sem provocar falhas ou limitação no PNCP real. Ela não comprova a disponibilidade externa. O DOM mínimo não substitui renderização em navegador.

## Testes em navegador real

Instale os navegadores necessários uma vez:

```sh
npx playwright install chromium firefox
npm run test:browser
```

`test:browser` compila um build de testes em `dist-browser-test/`, com provedor sintético no próprio Worker, e serve somente arquivos. Percorre todos os controles de filtros, buscas, colunas, paginação, três painéis, registros filhos, CSV, progresso/cancelamento, respostas atrasadas, XSS como texto, teclado e responsividade. Verifica ausência de chamadas `/api/...` à hospedagem.

Depois compila **o build de produção** em `dist-browser/`, verifica seus assets e Worker na raiz e em `/compras-web/`, e inspeciona bundles para dependências de Node, variáveis do processo e fixtures indevidas. As fixtures de falha/volume não são incluídas em produção.

A comparação de layout usa a referência visual fixa em [`test/layout-baseline.json`](../test/layout-baseline.json). Confere cores, fontes, espaçamentos e bordas do cabeçalho, linhas, células, rodapé e paginação nos três tipos documentais, em larguras de 1440, 1068 e 390 pixels, tanto na raiz quanto no subdiretório.

Dois servidores de origem controlada conferem CORS por requisições normais: controle positivo, negativo sem permissão e exposição de `Retry-After`. Não há interceptação de respostas ou segurança de origem/TLS desativada. Esse ensaio verifica o mecanismo do navegador, separado das chamadas reais ao PNCP.

O teste também exporta 10.000 documentos no Worker, mede tempo/bytes/chamadas e usa um temporizador da interface para conferir que ela continua recebendo eventos. Cancela uma segunda coleta no progresso e verifica uma pesquisa seguinte. A medição de memória total do Worker/Blob não está disponível nesse ensaio e é identificada como indisponível.

Para repetir a versão estática em Firefox:

```sh
COMPRAS_QA_BROWSER=firefox npm run test:browser
```

`COMPRAS_QA_BROWSER` aceita `chromium` (padrão), `firefox` e `webkit`; WebKit não substitui Safari real. O sistema precisa das bibliotecas dos navegadores. `COMPRAS_QA_BROWSER_EXECUTABLE` aceita um binário instalado no ambiente. `COMPRAS_QA_CHROMIUM_EXECUTABLE`, `COMPRAS_QA_CHROMIUM_MODULE` e `COMPRAS_QA_PLAYWRIGHT_MODULE` mantêm compatibilidade com instalações externas. `COMPRAS_QA_SCREENSHOT_DIR` salva capturas em um diretório já existente.

Em ambientes gerenciados, preserve proxy e confiança TLS. Use perfis temporários; não altere confiança compartilhada nem contorne CORS/TLS para declarar integração aprovada. Limitações de inicialização devem ser registradas separadamente. Considere a execução aprovada somente quando terminar com código zero e emitir o resumo final.

## Build e execução

```sh
npm run build
npm run preview
```

Abra `http://localhost:8000` para consultas reais e `/?demo=1` para demonstração explícita. Teste também `npm run demo` no desenvolvimento. As consultas sintéticas iniciais retornam 64 contratações, 24 atas e 32 contratos; `firewall` retorna seis contratações.

O histórico de contratos tem testes de contagem divergente (inclusive zero), total/páginas desconhecidos, continuação após páginas incompletas, término em página vazia, retorno à página anterior e reinício ao abrir outro documento. Núcleo, RPC e interface preservam os eventos sem relaxar a validação das outras listagens. O teste no navegador exercita esse fluxo com respostas controladas no Worker.

## Diagnóstico da integração real

Sirva o build final e abra `pncp-diagnostic.html`. Execute **Verificar acesso** e **Salvar evidência**. O diagnóstico consulta diretamente o PNCP na página e no Worker, registra origem/data/navegador, status e cabeçalhos legíveis de uma consulta da página e resultados tipados da matriz de recursos. Inclui pesquisas dos três tipos, página seguinte, ordenação/UF, filtros, sugestões, quatro catálogos auxiliares, detalhes e registros filhos. Exemplos públicos são fixos, com filhos escolhidos da listagem quando disponíveis.

Repita na origem HTTPS publicada em Chromium, Firefox e Safari, incluindo dispositivo móvel real e retomada de aba suspensa. Registros ausentes/404 não homologam uma amostra positiva; listas vazias legítimas e falhas são resultados distintos. HTTP 404 equivale a lista vazia em contratos vinculados à contratação e nas listagens de empenhos e instrumentos de cobrança de um contrato, mas não nos detalhes de registros individuais ou arquivos de termo. Respostas sem CORS não oferecem necessariamente status HTTP ao JavaScript.

## Resultado verificado

Medições de 8 de outubro de 2026, Linux, Node.js 24.19.0, Chromium 151 e Firefox 146.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 156 testes passaram, sem falhas/ignorados; inclui runtime/RPC/CSV e interface com serviço tipado |
| Interface estática em Chromium | 63 verificações, todos os 71/16/32 controles, painéis e CSV, sem API local ou erro JavaScript não tratado |
| Interface estática em Firefox | 63 verificações equivalentes |
| Artefato e CORS em Chromium/Firefox | Build de produção na raiz e subdiretório, assets/Worker locais, controle CORS negativo e cabeçalhos expostos; bundles sem dependências Node ou fixtures de teste |
| Exportação sintética no Worker | 10.000 documentos, 100 chamadas/páginas, 4.264.313 bytes; aproximadamente 3,2 s no Chromium e 1,5 s no Firefox nas medições locais; cancelamento após primeira página e pesquisa posterior concluída |
| Vite de desenvolvimento | Demonstração abriu, Worker pesquisou e não houve erro JavaScript não tratado |
| PNCP direto no Firefox | 32 operações da matriz: 29 concluídas e três HTTP 404 legíveis; consulta da página HTTP 200 com JSON/CORS legível |

A medição externa está em [`evidencias-browser-implementacao.json`](evidencias-browser-implementacao.json). Ela usa a distribuição estática, origem localhost, fetch nativo e TLS ativo, sem API de aplicação ou interceptação. O proxy de rede do ambiente permaneceu configurado; sua CA foi confiada apenas no perfil temporário. O Firefox precisou executar fora do isolamento de processos para inicializar, preservando segurança de origem e TLS.

O registro confirma acesso direto a buscas, domínios, catálogos, sugestões e principais recursos dos painéis. Empenhos e arquivos de termo retornaram 404 nas amostras; seus registros positivos são cobertos por fixtures. Os exemplos de vínculos incluíram atas e contrato existentes. Essas respostas e totais são observações daquela data, sujeitos a mudanças do PNCP.

As durações sintéticas usam ritmo elevado para medir processamento, sem representar latência do PNCP. Os padrões de 50 registros por página, duas chamadas por segundo e 120 segundos podem interromper uma coleta real de 10.000 registros. Limites por byte foram conferidos em fronteiras exatas, sem remover orçamentos.

A origem HTTPS de produção, Safari e dispositivo móvel real ainda não foram homologados. Viewports móveis e prazos conferidos após retomada não certificam suspensão física do dispositivo. Os procedimentos de publicação e recuperação estão em [Hospedagem estática](hospedagem-estatica.md) e no [plano](plano-implementacao-browser.md).
