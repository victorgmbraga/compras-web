# Relatório de validação — Compras Web 2.0.1

Data inicial: 1 de outubro de 2026. Atualização de integração: 2 de outubro de 2026. Ambiente de testes: Node.js 24.19.0, Linux. Backend Node.js; tabela Tabulator 6.3.1.

## Resultado

**54 testes automatizados passaram, sem falhas.** A saída completa está em `test-results.txt`. Incluem os 39 testes iniciais, cinco regressões da validação de tipo funcional e dez regressões da auditoria de integração. A interface foi conferida em navegador com fonte sintética explicitamente marcada. O build da distribuição Node.js foi executado.

Foram obtidas respostas reais via cURL e concluídas 11 verificações pela API HTTP local com reprodução dos corpos oficiais, incluindo busca, domínios, sugestões, itens, refinamento e CSV. A conexão direta do cliente Node.js apresentou timeout; houve HTTP 502 em rodadas anteriores neste ambiente. A cobertura, as correções e os limites estão em [auditoria-integracao-pncp.md](auditoria-integracao-pncp.md), com resumo em `auditoria-respostas-reais.json`. Os testes distribuídos usam cliente substituível e JSONs pequenos; o pacote não contém uma base de contratações nem cache de resultados reais.

## Cobertura automatizada

| Área | Verificações efetivamente executadas |
| --- | --- |
| Inicialização | Esquema e assets disponíveis sem fonte remota; 87 argumentos, 18 categorias e 11 opções de consulta; importação retorna 410 |
| Atualização | Consultas iguais realizam novas chamadas e mostram novas respostas |
| Validação | Campos desconhecidos/reservados, capacidades pendentes, tipos, status, datas inválidas, intervalos invertidos, IDs e domínios pequenos |
| Tipo funcional PNCP | `_doc` separado de `document_type`; busca, refinamento, CSV, projeção e identidade; tipos incompatíveis e excesso de documentos rejeitados com mensagens distintas |
| Serialização | Pipe codificado uma vez; booleano false, inteiro zero e decimal 0.00 preservados |
| Projeção | Decimais além de Number.MAX_SAFE_INTEGER; zero/false distintos de nulos; tipos incompatíveis rejeitados; links HTTP/HTTPS validados |
| Paginação | Total acima de 10000 separado da janela; zero; página fora do intervalo; coleta além da primeira página |
| Coleta | Mudança de total, duplicação e página vazia inesperada interrompem a operação; conjunto acima do limite não é truncado |
| Regras | Serviço e situação no mesmo item; catálogo correto e código exato; .0 só na configuração; informação ausente versus erro HTTP |
| Texto | Casefold Unicode, acentos não removidos em filtros literais, nulos/vazio/espaços, AND/OR e grupo de cabeçalhos |
| Categorias | Fronteiras Unicode, acentos, várias categorias e espaços dos termos históricos |
| Ordenação | Valores 2 e 10 numericamente; nulos no fim nos dois sentidos; filtro anterior ao agrupamento |
| Regex | Sintaxe inválida e subconjunto não suportado rejeitados antes da rede; padrão custoso interrompido no worker sem bloquear o event loop |
| Execução | Worker funcional com flags de execução do processo pai e arquivo de ambiente ausente |
| Itens | Página curta não encerra coleta; testemunha em página posterior é encontrada |
| Resiliência | HTML, JSON/protocolo inválido e 204 na busca não viram resultado vazio; tentativa limitada, orçamento global, cancelamento e redirect inseguro |
| Exportação | Nova coleta integral sem recorte da página; falha na última página; limite de buffer incluindo cabeçalho de CSV vazio; unknown exige confirmed_only; BOM, aspas e quebras |
| HTTP | Content-Type, corpo acima de 256 KiB, Cache-Control: no-store, metadados do CSV e marcação explícita da demonstração |

## Conferência no navegador

Foi usado um conjunto sintético de 64 documentos. Confirmado na interface:

1. Marcação visível de demonstração e início sem pesquisa automática.
2. Busca direta com 64 documentos; primeira página 1–50 e segunda 51–64.
3. Nova busca por firewall volta à página 1 e mostra seis contratações.
4. Detalhes e carregamento sob demanda de um item de serviço homologado; página vazia seguinte confirma o fim e desabilita avançar.
5. UF Goiás combinada com a busca por firewall produz zero resultados.
6. Regra adicional de objeto percorre 64 candidatos em duas chamadas e confirma seis contratações.
7. Preset Oracle percorre 64 candidatos, confirma seis documentos e consulta os itens, totalizando 14 chamadas sintéticas.
8. Desenvolvimento e Infraestrutura aparecem desabilitados com CATALOG_MAPPING_REQUIRED.
9. Seleção de CNPJ do órgão inclui a coluna no cabeçalho e nas linhas; desmarcar a remove.
10. Exportação pela interface conclui nova coleta e exibe seis linhas exportadas com horários e cobertura.
11. Uma falha preserva os resultados anteriores identificados e desabilita exportação. A falha descoberta na comunicação do worker foi corrigida e o refinamento foi novamente confirmado.
12. Layout de desktop conferido visualmente e capturado em `interface-compras-web-ampliada.jpg`.

A captura automática do evento de download de um Blob não foi disponibilizada pelo navegador de verificação; não se afirma que esse evento foi capturado. A resposta CSV, seus bytes, BOM, contagens e cabeçalhos foram validados nos testes HTTP. A geração e a mensagem de conclusão da interface foram observadas.

O script opcional `test/ui-smoke.mjs` foi incluído para repetir fluxos de interface com Playwright. Sua execução automatizada completa não terminou neste ambiente: o Chromium local encerrou durante a inicialização. A conferência acima usou o navegador disponível. Na rodada inicial, redimensionamento para celular e cenários automatizados de respostas fora de ordem não foram executados nesse navegador. A conferência posterior de viewports menores está registrada abaixo; cenários automatizados de respostas fora de ordem continuam sem execução completa no navegador. O código contém AbortController e controle de sequência.

## Medições locais com fonte sintética

Os números abaixo medem processamento local, não desempenho nem disponibilidade do PNCP. O rate limiter foi configurado em 100000 chamadas/segundo apenas no benchmark para retirar a espera artificial do cliente sintético. O padrão da aplicação permanece duas chamadas/segundo.

| Operação | Candidatos | Linhas | Chamadas sintéticas | Duração | RSS antes / depois |
| --- | ---: | ---: | ---: | ---: | ---: |
| Busca nativa por firewall | 6 | 6 | 1 | 113 ms | 49,4 / 55,4 MiB |
| Refinamento preset Oracle | 64 | 6 | 14 | 196 ms | 55,4 / 79,5 MiB |
| Exportação nativa integral | 64 | 64 | 2 | 9 ms | 79,5 / 76,5 MiB |

O CSV medido teve 29654 bytes. RSS são amostras antes/depois, não picos. Os detalhes estão em `benchmark-demo.json`; a repetição é `npm run benchmark:demo`.

## Limites e validação restante

- Somente edital tem projeção implementada. Os outros tipos são reconhecidos e ficam indisponíveis.
- Filtros básicos habilitados usam a evidência documental fornecida, explicitada em `/api/schema`; os demais argumentos permanecem pending_validation.
- Verificar na fonte real o efeito dos filtros, os domínios e as identificações originais antes de habilitar novas capacidades ou otimizações.
- Associar um catálogo oficial verificado para habilitar os dois presets por código.
- Confirmar formato e paginação efetiva do serviço de itens com exemplos reais. Respostas fora do formato esperado geram erro, sem coleta parcial apresentada como completa.
- Não há garantia de snapshot entre páginas. A detecção de inconsistências cobre alterações observáveis, sem afirmar imutabilidade do conteúdo.
- Dockerfile incluído; imagem Docker e publicação em serviço externo não foram executadas.

## Correção observada na interface

Uma mensagem de inicialização do ambiente chegou ao canal do worker antes do resultado de negócio. A aplicação agora identifica mensagens pelo protocolo e requestId da operação, ignora mensagens externas ao protocolo e mantém timeout/cancelamento. Os workers também não herdam flags CLI incompatíveis. O refinamento voltou a funcionar e os 39 testes passaram com essa implementação.


## Atualização do layout — tabela ampliada

A busca foi compactada em uma linha principal e uma linha de critérios. Consultas prontas ficam junto aos filtros. A grade usa a altura restante da janela e a rolagem permanece dentro da tabela. Critérios extensos possuem rolagem horizontal própria, evitando que reduzam indefinidamente a área dos resultados.

Medições no navegador, com a mesma janela de **1363 × 936 px** e os mesmos dados sintéticos:

| Elemento | Antes | Depois |
| --- | ---: | ---: |
| Área de busca: altura | 173 px | 67 px |
| Painel de resultados: altura | 642 px | 807 px |
| Tabulator, incluindo paginação: altura | 523 px | 734 px |
| Tabulator: largura | 1313 px | 1345 px |
| Primeira linha do exemplo: altura | 71 px | 51 px |
| Tabulator no modo expandido: altura | — | 851 px |

A tabela ganhou **40,3% de altura** no layout normal. O painel de resultados ocupa **86,2% da altura** e **98,8% da largura** da janela. No modo expandido, o Tabulator ocupa **90,9% da altura**.

Conferido no navegador:

- Busca com 64 contratações sintéticas e paginação 1–50 / 51–64.
- Expansão na segunda página preserva a paginação e os critérios.
- Detalhes abrem durante a expansão. Fechar o diálogo mantém a expansão.
- Restaurar pelo botão ou por Esc devolve os controles de busca.
- Filtros e consultas prontas abrem após a reorganização; abrir consultas prontas não dispara o formulário de busca.
- Viewports adicionais de **390 × 844** e **900 × 500** renderizados em iframes temporários no mesmo navegador: busca, filtros e paginação disponíveis; sem overflow da página. São testes de layout, não emulação de um aparelho real.
- Controles de paginação compactados em telas estreitas; primeiras e últimas páginas mantêm rótulos e títulos acessíveis.

Captura da revisão de layout: `interface-compras-web-ampliada.jpg`. Captura atual após a auditoria: `interface-compras-web-auditoria.jpg`, com atualização preservando a segunda página. A configuração temporária de verificação foi removida da aplicação antes do empacotamento.
