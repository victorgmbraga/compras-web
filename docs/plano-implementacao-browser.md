# Plano de implementação da versão para navegador

Atualizado em 8 de outubro de 2026. **P1–P5 estão implementadas**, com núcleo compartilhado, build estático, transporte nativo, Worker/RPC, interface e CSV local. A regressão funcional passou em Chromium e Firefox; houve acesso direto ao PNCP pelo Firefox em localhost. Publicação e homologação no domínio HTTPS de destino/Safari permanecem pendentes operacionais, sem impedir o uso do artefato entregue.

Os comandos e arquivos deste plano agora existem. Veja [Validação](validacao.md), [evidências diretas da implementação](evidencias-browser-implementacao.json) e [Hospedagem estática](hospedagem-estatica.md). A distribuição Node.js e sua API foram preservadas. O workflow de GitHub Pages está preparado para execução manual, sem publicação automática.

## Objetivo e escopo

Entregar uma distribuição de arquivos estáticos em que o navegador pesquisa o PNCP, aplica os filtros, apresenta os painéis dos três tipos e gera CSV, sem API própria, proxy de aplicação ou funções serverless em produção. A hospedagem fornece arquivos por HTTPS; as consultas reais continuam dependendo do PNCP.

Preservar os 80 filtros, com 71 aplicáveis a contratações, 16 a atas e 32 a contratos; colunas, ordenação, paginação, estados de erro, precisão numérica e demonstração explícita. Conservar a distribuição Node.js como referência funcional e possibilidade de retorno durante a transição.

PWA, armazenamento persistente, consultas reais offline, coordenação entre abas, novos tipos documentais e reformulação visual ficam fora desta primeira migração. A retirada definitiva do pacote Node.js é posterior à homologação e à verificação de consumidores da API atual.

## Decisões de arquitetura

| Tema | Direção adotada para implementação |
| --- | --- |
| Núcleo | Compartilhar validação, esquema, projeções, caminhos PNCP, consistência da coleta e formatação CSV entre as duas distribuições. |
| Transportes | Adaptador Node.js com Undici e adaptador de navegador com `fetch`; nenhum import de Node.js no grafo do bundle estático. |
| Execução | Um Worker dedicado por aba, dono de um cliente PNCP, fila, operações e configuração. A interface mantém DOM, Tabulator, navegação e download. |
| Interface de serviço | Métodos assíncronos retornam dados e metadados; a interface deixa de depender de `Response`, URLs locais de API e cabeçalhos de exportação. |
| Build | Adotar Vite como dependência de desenvolvimento, com entradas para aplicação e Worker. Reutilizar o HTML e os estilos atuais; evitar duas cópias editáveis do layout. |
| Distribuições | Acrescentar `build:browser` e saída `dist-browser/`; manter `npm run build` e `dist/` para Node.js até a decisão de promoção. |
| Configuração | Objeto público com chaves permitidas e validação própria. Não copiar `.env` nem expor automaticamente variáveis do processo. Configurações de porta, proxy e agente HTTPS ficam no adaptador Node.js. |
| Fonte e cache | PNCP real por padrão; demonstração escolhida explicitamente e identificada. Consultas com `cache: 'no-store'`; nenhuma troca automática para dados sintéticos após uma falha. |
| Publicação | Suportar raiz e subdiretório, incluindo `/compras-web/`. Escolher hospedagem e URL de homologação na etapa P0; o build não depende de um provedor específico. |

Os caminhos abaixo correspondem à implementação entregue; os checkboxes distinguem código e verificações concluídas de homologação externa ainda necessária.

## Sequência e dependências

| Etapa | Entrega | Dependência para conclusão |
| --- | --- | --- |
| P0 | Prova direta de acesso e matriz de compatibilidade | Página estática acessível e navegadores-alvo |
| P1 | Núcleo independente de Node.js e validações compartilhadas | Inspeção do código atual |
| P2 | Estrutura de build, assets e configuração estática | P1 para incluir o núcleo; preparação do build pode começar antes |
| P3 | Transporte de navegador e serviço no Worker | P1 e P2 |
| P4 | Pesquisa, filtros e painéis ligados ao serviço local | P3 |
| P5 | Exportação local com controle de memória e cancelamento | P3 e integração da interface de P4 |
| P6 | Homologação, documentação operacional e publicação | P0 a P5 concluídas e critérios finais atendidos |

Iniciar a prova P0 cedo. Uma limitação do ambiente de teste deve ser registrada como inconclusiva; ela permite desenvolver e testar P1–P5 com fontes controladas. Um bloqueio persistente de CORS em recurso necessário impede aprovar a operação integral estática. A publicação definitiva depende de P0, mesmo que a demonstração funcione.

## P0 — Provar acesso direto e fixar a matriz de validação

**Entregáveis:** página mínima de diagnóstico, roteiro repetível e registro de URL, navegador/versão, data, recurso, status visível e resultado. Guardar novas medições separadamente das [evidências existentes](evidencias-browser-pncp.json).

- [ ] Definir a URL HTTPS de homologação e verificar que sua hospedagem entrega somente arquivos estáticos. Testar também em localhost durante o desenvolvimento.
- [x] Consultar diretamente o PNCP com `GET`, `mode: 'cors'`, `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'error'` e `Accept: application/json`. Executar uma amostra também a partir de um Worker da própria origem.
- [x] Verificar busca dos três tipos, texto, ordenação, página seguinte, `/filters`, `/suggest` e os catálogos auxiliares efetivamente utilizados.
- [x] Percorrer a matriz de detalhes abaixo, incluindo contagens e registros filhos. Escolher exemplos públicos reproduzíveis; registrar ausência de dados positivos sem inventar total zero.
- [ ] Conferir cabeçalhos visíveis, comportamento de cache, preflight, JSON legível e tratamento de redirecionamentos em Chromium, Firefox e Safari. Playwright WebKit pode complementar o teste, mas não substitui a verificação em Safari.
- [x] Testar falhas CORS com duas origens controladas e um controle negativo sem permissão de acesso. Não usar interceptação de respostas ou segurança desativada como evidência de CORS real. Não provocar limitação de chamadas no PNCP para obter erros.

| Documento | Recursos que precisam entrar na verificação |
| --- | --- |
| Contratação | Itens e quantidade; arquivos e quantidade; histórico e quantidade; atas vinculadas; contratos/empenhos vinculados. Os campos principais atuais vêm da busca. |
| Ata | Dados completos; partes envolvidas; contratos; arquivos e quantidade; histórico e quantidade. |
| Contrato | Dados completos; empenhos; instrumentos de cobrança; termos e quantidade; arquivos e quantidade; histórico e quantidade; arquivos de termo e detalhes de empenho/instrumento. |

**Aceite:** respostas esperadas legíveis por acesso direto a partir da origem de homologação, sem backend da aplicação. HTTP 404 legível demonstra transporte e tratamento de erro, mas não valida os campos de um registro existente; cenários sem amostra positiva precisam de fixture e limitação de cobertura explícita. HTTP 503 ou falha TLS não aprovam nem refutam, isoladamente, a política CORS de uma resposta de sucesso.

## P1 — Extrair o núcleo e as validações das rotas

**Arquivos principais:** [`src/pncp.js`](../src/pncp.js), [`src/query.js`](../src/query.js), [`src/server.js`](../src/server.js), [`src/config.js`](../src/config.js) e [`src/validation.js`](../src/validation.js).

- [x] Extrair operações, prazos e orçamentos para um módulo portável, em `src/operation.js`. Remover a dependência transitiva de `QueryService` no módulo que importa Undici.
- [x] Separar a lógica PNCP do transporte, em `src/pncp-core.js`, mantendo serialização dos 80 filtros, normalização de domínios, identidades, paginação e exceções de status em uma única implementação.
- [x] Manter `src/pncp.js` como adaptador Node.js e preservar seus exports usados pelos testes durante a transição. Injetar transporte, política de redirecionamento e funções de plataforma nos pontos necessários, sem polyfills de Node.js no navegador.
- [x] Extrair de `server.js` as validações de tipo documental, campo de domínio, normativos, sugestões de 3–128 caracteres e tamanho de 1–20, CNPJ, ano, sequenciais positivos e paginação de detalhes. Chamar essas regras na fronteira do serviço antes da rede. Regras exclusivamente HTTP, como método e tamanho do corpo, continuam no servidor.
- [x] Separar configurações e padrões compartilhados da leitura de `process.env`. Validar explicitamente os campos públicos, as bases HTTPS do PNCP e limites positivos. Preparar modo real e demonstração sem opções de proxy/credenciais no bundle.
- [x] Extrair o mecanismo comum de coleta por página e as regras CSV. Manter compatibilidade do serviço Node.js existente enquanto os novos consumidores são introduzidos.

**Aceite:** testes de contrato, validação, filtros, detalhes e exportação continuam passando com o adaptador Node.js; entradas inválidas são rejeitadas antes das chamadas externas. O núcleo pode ser importado em um bundle de navegador sem `node:*`, Undici, `process.env`, `Buffer` ou `unref`. A precisão continua baseada em `lossless-json` e nas projeções atuais.

## P2 — Preparar a distribuição estática desde o início

**Arquivos principais:** [`package.json`](../package.json), lockfile, [`public/index.html`](../public/index.html), assets de [`public/`](../public/), configuração Vite implementada e scripts de build/preview implementados.

- [x] Acrescentar Vite apenas como ferramenta de desenvolvimento, com versão fixada no lockfile. Criar entrada estática que reutilize a interface e compile imports de JSON, bibliotecas e Worker.
- [x] Gerar `dist-browser/` separadamente de `dist/`; acrescentar a saída ao `.gitignore`. Definir `build:browser`, `dev:browser` e `preview:browser`, com modo de demonstração explícito. O preview serve apenas arquivos.
- [x] Incluir Tabulator, `lossless-json`, CSS, favicon, licenças e configuração pública no artefato. Resolver bibliotecas no build, sem dependência de CDN ou imports de pacote não resolvidos em tempo de execução.
- [x] Ajustar referências de scripts, CSS, Worker, configuração e link da marca para raiz e subdiretório. Verificar MIME correto de módulos e Worker, incluindo abertura com barra final na URL do diretório.
- [x] Definir CSP para a página e, quando suportado, para respostas do Worker: conexões ao PNCP e Worker da própria origem. Documentar as limitações da hospedagem quanto a cabeçalhos, `frame-ancestors` e CSP por `<meta>`.
- [x] Definir atualização de HTML/configuração e versionamento dos bundles para evitar mistura de versões após uma publicação. Não instalar Service Worker nesta migração.

**Aceite:** a distribuição abre por um servidor estático genérico, carrega um Worker e executa uma chamada local de diagnóstico sem API. Funciona em `/` e em `/compras-web/`; assets são locais, e a inspeção do bundle não encontra dependências Node.js. `npm run build` continua gerando a distribuição Node.js atual.

## P3 — Implementar o transporte e o serviço no Worker

**Módulos entregues:** `src/browser/client.js`, `src/browser/worker.js` e uma ponte de mensagens para a interface.

- [x] Implementar o transporte nativo e a leitura incremental com `ReadableStream` e `TextDecoder`, respeitando o orçamento de bytes antes de interpretar JSON com `lossless-json`.
- [x] Aplicar as opções verificadas em P0 e manter as bases permitidas da API. Redirecionamento bloqueado ou falha de `fetch` não deve receber um status HTTP inventado. Não usar `mode: 'no-cors'`.
- [x] Usar uma fila por Worker para todas as operações: inicialmente 2 requisições simultâneas, 2 chamadas por segundo e até 4 operações ativas. Preservar orçamentos de tentativas, bytes, itens e chamadas. Rejeitar excesso de operações com erro recuperável e remover trabalhos cancelados da fila.
- [x] Aplicar prazo de requisição e de operação. O timeout de conexão do agente Node.js não será exposto como uma garantia do navegador. Conferir o prazo absoluto antes de iniciar nova chamada e após retomar atividade.
- [x] Preservar tentativas limitadas para falhas recuperáveis, espera progressiva e `Retry-After` quando legível. Uma resposta opaca ou bloqueada deve produzir erro de transporte; manter resultados anteriores e permitir nova tentativa.
- [x] Implementar o protocolo abaixo, incluindo inicialização/configuração, desligamento, erro inesperado do Worker e rejeição de todas as operações pendentes quando ele falhar.
- [x] Projetar respostas no Worker antes de enviá-las à interface. Converter instâncias `LosslessNumber` e erros para os formatos de dados definidos, preservando decimais como texto quando exigido pelos adaptadores.

### Contrato da ponte

| Mensagem | Conteúdo e comportamento |
| --- | --- |
| Inicialização | Versão do protocolo e configuração pública validada; a interface aguarda confirmação antes de pesquisar. |
| Operação | `{ id, method, payload }`, com `method` pertencente a uma lista explícita. A API de interface aceita `signal` e `onProgress`, mantidos localmente. |
| Resultado | `{ id, result }`, usando objetos simples. A interface resolve somente a operação correspondente e ainda ativa. |
| Erro | `{ id, error: { code, message, status, details, retryable } }`. `status` pode ser um código da aplicação; um HTTP da fonte só entra em `details` quando realmente observado. |
| Progresso | `{ id, progress: { pages, rows, total, bytes } }`, emitido em limites de página/lote, sem transmitir todos os documentos coletados. |
| Cancelamento | `{ type: 'cancel', id }`. O Worker aborta o controller local, retira tarefas pendentes e libera recursos. A interface descarta mensagens tardias. |

Métodos da ponte: esquema, pesquisa (`execute`), domínios, sugestões, itens da contratação, listagens relacionadas, detalhe de ata/contrato, registros filhos e exportação. O `AbortSignal` não atravessa a ponte; seu evento local gera a mensagem de cancelamento. Fechar um painel cancela suas operações, preservando as demais. Encerrar o Worker inteiro fica reservado a descarte da aplicação ou recuperação de falha.

**Aceite:** pesquisas sintéticas dos três tipos executam no Worker; concorrência e ritmo são compartilhados entre métodos; cancelamento funciona em fila, espera e leitura. Mensagens fora de ordem não trocam resultados. Testes controlados cobrem HTTP 204, 404, 429 e 5xx, JSON inválido, redirecionamento, erro sem CORS e orçamento excedido, sem exigir que esses eventos sejam provocados no PNCP real.

## P4 — Ligar a interface ao serviço e preservar todos os painéis

**Arquivos principais:** [`public/app.js`](../public/app.js), esquema e projeções compartilhadas, adaptadores de serviço HTTP e Worker implementados, e [`test/interface.test.js`](../test/interface.test.js).

- [x] Tornar a inicialização da interface dependente de um serviço injetado. O adaptador HTTP atende a distribuição Node.js; o adaptador Worker atende a versão estática. Ambos retornam o mesmo formato funcional, sem exigir objetos `Response` da interface.
- [x] Substituir as chamadas de esquema, pesquisa, domínios e sugestões. Manter o callback de paginação remota do Tabulator apontando para o serviço, a seleção de colunas, o estado dos últimos critérios concluídos e a indicação de resultado anterior após erro.
- [x] Preservar os 80 filtros e sua compatibilidade documental, inclusive `false` distinto de ausência, decimais exatos, IDs alfabéticos de países, zeros à esquerda, reconciliação de normativos/amparos, status e ordenação por relevância.
- [x] Substituir a construção de URLs locais de detalhes por parâmetros tipados de documento e recurso. Manter separados o sequencial da compra, o da ata e o do contrato, e conferir a identidade do detalhe completo antes de atualizar os campos da busca.
- [x] Migrar todas as abas, contagens, paginação, registros filhos e tentativas por seção da matriz P0. Preservar o carregamento em segundo plano, a fila do painel com duas tarefas e o descarte de respostas de documentos fechados.
- [x] Manter arquivos como links de navegação/download da fonte, sem acrescentar uma busca do conteúdo binário ao fluxo de abertura do painel. Preservar links externos seguros, foco, teclado e atributos ARIA.
- [x] Ligar o modo de demonstração ao provedor sintético no Worker e conservar sua identificação visível. Adaptar os testes de DOM para injetar o serviço, em vez de depender da avaliação de um script sem imports em `vm`.

**Aceite:** demonstração estática permite pesquisar 64 contratações, 24 atas e 32 contratos, usar os controles de filtros e navegar por todas as abas e registros filhos. Nenhuma dessas ações chama `/api/...` da própria hospedagem. Trocas rápidas de consulta, tipo e documento mantêm a consistência, com ou sem falhas simuladas. O adaptador HTTP continua passando pela suíte existente.

### Semântica obrigatória de erros e listas vazias

| Evento | Comportamento a preservar |
| --- | --- |
| HTTP 404 na consulta de contratos vinculados à contratação | Lista vazia e contador zero somente nesse recurso. |
| HTTP 404 em detalhe completo, empenhos de contrato ou outros recursos | Erro, sem presumir total zero. |
| HTTP 204 em uma listagem que já aceita ausência de conteúdo | Aplicar a semântica vazia existente e conferir a consistência com a contagem, se houver. |
| HTTP 204 na busca ou em recurso que exige JSON | Resposta inválida, sem converter para pesquisa vazia. |
| CORS, TLS, offline ou falha de transporte sem status acessível | Erro recuperável de transporte; nenhuma equivalência com HTTP 404. |
| Contagem, total, página ou identidade incompatíveis | Erro de consistência, preservando a possibilidade de repetir a consulta. |

## P5 — Exportar no navegador com memória limitada

**Arquivos principais:** serviço de consultas, módulo CSV portável implementado, Worker, ação de exportação e testes de coleta.

- [x] Reutilizar o mecanismo de coleta por página de P1. Validar domínios e iniciar uma nova coleta com os últimos critérios concluídos; não exportar apenas os registros carregados na tabela.
- [x] Por página, conferir total, tamanho esperado, identidade e duplicação. Projetar e codificar o CSV em lotes com `TextEncoder`, preservando BOM, CRLF, ordem de todas as colunas, aspas, quebras de linha, acentos e valores exatos.
- [x] Acumular chunks binários dentro do orçamento, liberar páginas já processadas e manter apenas o estado necessário às conferências. Entregar `ArrayBuffer` ou chunks transferíveis à interface, evitando a clonagem de todo o CSV e da coleção de documentos.
- [x] Retornar nome de arquivo, MIME, bytes e metadados compactos: linhas exportadas, total da fonte, filtros efetivos, início/fim e `snapshot_guaranteed: false`. A interface cria o `Blob`, inicia o download e revoga a URL após uso. Não depender de `Content-Disposition` ou dos atuais cabeçalhos `X-*`.
- [x] Preservar a compatibilidade necessária de `metadata.data` no caminho Node.js, utilizado pelos testes e benchmark atuais; a versão de navegador não deve enviar esse array completo. Os dois caminhos compartilham coleta, consistência e formatação, evitando regras duplicadas.
- [x] Devolver o controle ao loop de eventos entre páginas/lotes para processar cancelamento. Emitir progresso por operação e limpar chunks, controllers e tarefas pendentes em sucesso, falha ou cancelamento. Nunca iniciar download de uma coleta incompleta.
- [x] Medir 10.000 documentos sintéticos e cenários próximos dos limites de bytes. Considerar os padrões atuais de 50 MiB de CSV, 100 MiB lidos por operação, 1.000 chamadas e 120 segundos de operação. Ajustar limites públicos somente com justificativa e mensagem de erro correspondente; não remover limites para fazer o teste passar.

**Aceite:** com a mesma fixture, bytes CSV do navegador e da versão Node.js são equivalentes para cada tipo documental. Fonte alterada, duplicação, limite excedido e cancelamento não produzem arquivo. A interface continua responsiva, o Worker reconhece cancelamento e não inicia novas chamadas daquela operação após reconhecê-lo. Registrar tempo, bytes, chamadas e consumo de memória quando o navegador permitir medi-lo; testar também retomada após suspensão e um dispositivo móvel. Uma coleta sintética rápida não certifica o tempo de uma exportação real no PNCP.

## P6 — Homologar e preparar a publicação

**Arquivos principais:** testes, scripts de validação, README, guias de arquitetura/configuração/validação e um guia de hospedagem estática implementado.

- [x] Adaptar [`test/ui-smoke.mjs`](../test/ui-smoke.mjs) para aceitar o alvo estático, servindo `dist-browser/` sem `createApplication`. Fixar as ferramentas de testes de navegador necessárias para execução reproduzível. Manter um alvo Node.js enquanto houver duas distribuições.
- [x] Executar a matriz de regressão abaixo. As referências registradas são 155 testes automatizados e 61 verificações de Chromium da versão atual; comparar cobertura e resultados, sem exigir que a contagem permaneça igual após a refatoração.
- [ ] Repetir P0 usando o build final em HTTPS e nos navegadores-alvo. Identificar testes com dados sintéticos, testes CORS controlados e chamadas reais como evidências distintas. Casos não executados não contam como aprovação.
- [x] Conferir artefato, subdiretório, políticas da hospedagem e ausência de chamadas às rotas próprias de API. Medir exportação, cancelamento e consumo de recursos antes de definir os limites finais.
- [x] Atualizar documentação com comandos realmente implementados, configuração pública, limites, mensagens de erro, publicação e procedimento de retorno. Explicar a disponibilidade separada da API Node.js para eventuais consumidores existentes.
- [ ] Publicar o artefato homologado no destino definido, conferir carregamento e pesquisa após a publicação e manter a implantação Node.js disponível durante a transição. Só então decidir se o build estático passa a ser o padrão e quando retirar a implantação antiga.

### Matriz de regressão

| Área | Verificação e critério |
| --- | --- |
| Filtros | Exercitar os 80 filtros em pesquisa e CSV com fixtures, respeitando 71/16/32 por tipo; rejeitar intervalos, tipos e combinações inválidas antes da rede quando aplicável. |
| Validação de fronteira | Repetir sugestões inválidas, domínios incompatíveis, CNPJ/ano/sequenciais e páginas inválidas pelo serviço Worker, cobrindo regras extraídas de `server.js`. |
| Precisão | Valores acima do limite seguro de inteiros, decimais longos, IDs com zeros à esquerda, texto acentuado e caracteres divididos entre chunks de leitura; comparar dados e bytes esperados. |
| Pesquisa e estado | Página seguinte, ordenação, status, mudança de tipo, atualizar, nova tentativa e cancelamento; respostas antigas não substituem a pesquisa atual. |
| Detalhes | Matriz P0, contadores, ausência/erro, mais de uma página, identidade completa, carregamento em segundo plano e registros filhos; testar a exceção 404 exclusivamente onde se aplica. |
| Worker e concorrência | Mensagens fora de ordem, falha do Worker, cancelamento antes/depois de enfileirar, várias operações simultâneas e retomada; filas e promessas são liberadas. |
| CSV | Equivalência por fixture, todos os campos, nova coleta, metadados, limite por documento/byte/tempo, origem alterada e nenhum download parcial. |
| CORS e HTTP | Testes normais entre duas origens com controle negativo, mais chamada direta de produção. Mocks/interceptações usados em testes funcionais não validam CORS. |
| Build | Somente arquivos estáticos, dependências locais, Worker e módulos com MIME correto, raiz/subdiretório, sem import de Node.js e sem API da aplicação. |
| Interface | Teclado, foco, responsividade, colunas, links, progresso e erros; nenhum erro JavaScript não tratado. |
| Demonstração | Totais e detalhes sintéticos por tipo, identificação permanente e ausência de tráfego para o PNCP. |

### Critérios para promover a versão estática

1. P0 está aprovada para a origem e os navegadores definidos, com limitações de amostras positivas explicitadas e nenhum bloqueio de acesso a recurso obrigatório.
2. Pesquisa, filtros, três painéis e CSV passam pela matriz de regressão em um servidor exclusivamente estático.
3. Precisão, cancelamento, filas, limites e tratamento de erro estão preservados e medidos no navegador.
4. O artefato publicado usa a hospedagem apenas para arquivos; todas as consultas reais seguem diretamente ao PNCP.
5. Documentação, configurações e retorno à implantação anterior estão prontos; consumidores da API Node.js, caso existam, têm continuidade definida.

Se algum critério falhar, a implantação Node.js continua sendo a versão operacional enquanto a causa é resolvida. A introdução de proxy ou função serverless exigiria revisar o objetivo de funcionamento sem backend próprio e este planejamento.

## Organização das entregas

As entregas estão organizadas por módulos e verificações do núcleo, build, Worker, interface e CSV. A homologação em produção e a publicação devem seguir o procedimento operacional, preservando a alternativa Node.js até os critérios de promoção serem atendidos.

Não fixar uma data de conclusão apenas pela quantidade de arquivos. Os fatores que mais podem alterar o esforço são compatibilidade de CORS/redirecionamentos, adaptação dos testes de interface e memória/tempo da exportação. Reavaliar o esforço após a prova de acesso e o primeiro fluxo real de pesquisa no Worker.

## Resultado da implementação

- O runtime e a ponte estão em `src/browser/runtime.js` e `src/browser/service.js`; protocolo em `src/browser/protocol.js`.
- `public/app.js` recebe serviço, DOM e Tabulator; `browser-entry.js` e `node-entry.js` inicializam cada modo. `http-service.js` mantém compatibilidade da API.
- `src/query-core.js` coleta por páginas e `src/csv.js` codifica lotes; o adaptador Node.js preserva `metadata.data`, e o Worker transfere somente buffers/metadados.
- `vite.config.js` entrega aplicação, diagnóstico, configuração, assets e licenças. O teste usa um build separado, `dist-browser-test/`, com fixtures de falha/volume; essas fixtures não entram no artefato de produção.
- A interface estática passou em 63 verificações por navegador, mais controles de CORS, raiz/subdiretório e exportação de 10.000 documentos. Memória total do Worker, dispositivo móvel real, Safari e origem HTTPS de produção ainda exigem ensaio próprio. Não foram removidos os limites para fazer os testes passar.
- A prova direta local está registrada em JSON. HTTP 404 legível em empenhos e arquivos de um termo não comprova amostra positiva desses recursos; fixtures cobrem comportamento e tratamento. A consulta inicial teve JSON legível com HTTP 200 e `type: cors`.

As etapas de publicação não foram executadas nesta implementação: não há domínio estático de destino definido. O workflow manual e os guias deixam o artefato pronto para essa etapa, sem alterar a implantação Node.js existente.
