# Implementação e verificação dos filtros do PNCP

Revisão: 8 de outubro de 2026.

## Situação atual

Os **80 filtros do catálogo estão implementados**, sem capacidades pendentes: **71 para contratações (`edital`)**, **16 para atas (`ata`)** e **32 para contratos (`contrato`)**. Os outros sete argumentos são controles reservados ao adaptador, e não filtros a acrescentar em `pncp_filters`.

A implementação abrange controles da interface, formatos JSON, compatibilidade documental, domínios, serialização nativa, pesquisa, CSV e demonstração. Os três tipos pesquisados têm colunas, projeção e painéis próprios. Atas aceitam os nove filtros gerais/documentais de UF, órgão, unidade, município, esfera, poder, ano, modalidade e instrumento convocatório, além de adesão e seis limites de publicação, assinatura e início da vigência. IRP e PCA permanecem sem projeção.

`state: enabled` informa disponibilidade no aplicativo. `validation_status` e `evidence` registram o alcance da verificação, sem afirmar homologação integral da fonte:

| Valor | Alcance |
| --- | --- |
| `sampled_live` | Há controles reais documentados para o filtro; não garante todas as combinações |
| `integration_tested` | Formato, controle, domínio e transporte têm cobertura automatizada; o predicado externo pode ter apenas amostras ou ainda não ter controle positivo |
| `operator_declared` | Conferência externa declarada pelo operador via `PNCP_VALIDATED_FILTERS`, quando não há evidência real previamente registrada |

Não é necessário preencher `PNCP_VALIDATED_FILTERS` para usar os filtros. A variável permanece por compatibilidade e não modifica o contexto documental.

## Grupos implementados

| Grupo | Recursos |
| --- | --- |
| Documento | UF, órgão, unidade, município, IBGE, esfera, poder, ano, modalidade, situação, instrumento convocatório, SRP, origem, orçamento, normativo/amparo, publicação e valores |
| Condições e vínculos | Sigilo, ata, contrato/empenho, nota fiscal, conteúdo nacional, emenda parlamentar e adesão |
| Sub-rogação | Órgãos e unidades por seus IDs, com opções parciais e sugestões |
| Item | Tipo, situação, critério, categoria de leilão, benefício, unidade de medida, incentivo, margens aplicáveis, quantidade e valores estimados |
| Resultado | Situação, classificação, reserva/remanescente, homologação, subcontratação, aplicação de preferência/benefício/desempate, quantidades, valores e desconto |
| Fornecedor | Fornecedor, município, país, porte e natureza jurídica do fornecedor do resultado |
| Contrato | Tipo, nota fiscal, fornecedor contratado/subcontratado, assinatura, início de vigência e valor global |

O [contrato do serviço do navegador](consultas-pncp.md#filtros-habilitados-por-padrão) lista os nomes e formatos. [`src/pncp-arguments.json`](../src/pncp-arguments.json) contém o inventário completo; o método `schema` do Worker publica os metadados vigentes.

## Formatos e domínios

- Booleanos recebem `true` ou `false` JSON. Omissão, `false` e informação ausente são distintos.
- IDs de órgãos, unidades, fornecedores, portes e naturezas jurídicas são strings. O ID de seleção não é substituído por CNPJ, nome, código da unidade ou código IBGE. Zeros à esquerda são preservados.
- Países recebem o ID alfabético de três letras do catálogo, como `BRA`. O formulário oficial do PNCP carrega `/paises` e transforma `id` com `String(id)` para a seleção; não utiliza `codigoPaisBcb` nesse controle.
- Unidades de medida preservam texto, caixa, abreviações e espaços. `UNIDADE` e `Unidade ` são valores distintos.
- Tipo de item e tipo de margem de preferência têm seleção singular. Demais seleções são listas e usam pipe somente no transporte remoto.
- Quantidades e valores são strings decimais não negativas, sem notação exponencial. As comparações de intervalos e da demonstração preservam todas as casas decimais.
- Classificação usa inteiros JSON não negativos e seguros; zero não é descartado. Desconto usa strings entre `0` e `100`, sem `%`.
- Datas são reais, no formato `AAAA-MM-DD`. Pares invertidos são recusados antes da rede. O intervalo de início de vigência restringe a data inicial, não a data final.

Domínios pequenos da busca são conferidos antes da pesquisa e do CSV. Países, portes, naturezas jurídicas e situações de resultados usam seus catálogos em `/api/pncp/v1`; o último é `/situacoes-compra-item-resultado`, também utilizado pelo formulário oficial. Situações de resultado são normalizadas na chave `resultado_item_situacoes`.

Sub-rogação, fornecedores, municípios de fornecedores e unidades de medida usam opções parciais e sugestões, sem presumir que a lista inicial seja exaustiva. Reservas/remanescentes usam a enumeração de referência registrada no catálogo: `1` Não se aplica, `2` Remanescente e `3` Cadastro de reserva. O provedor `reference` entrega e valida esses IDs sem depender de uma chave ausente em `/filters`.

Ao mudar o normativo, a interface reconcilia os amparos, preserva os compatíveis, remove os incompatíveis com aviso e bloqueia a pesquisa se a conferência falhar.

## Semântica de consulta

Todos os critérios são enviados à busca nativa. A aplicação mantém a ordem e a paginação da fonte, sem refinamento local de resultados reais. Tabela e CSV representam documentos: uma linha por contratação, ata ou contrato.

Filtros de itens, resultados e fornecedores de resultados selecionam contratações. Seus detalhes preservam todos os itens, inclusive os que não atendem aos critérios. Condições distintas podem corresponder a itens ou resultados diferentes; não existe promessa de correlação no mesmo registro filho. Preferência ou benefício aplicável ao item não equivale à sua aplicação no resultado.

O seletor documental reinicia a pesquisa e os critérios, ajusta filtros, status e colunas e descarta respostas antigas. Atas e contratos usam `todos`, `vigente` ou `nao_vigente`; contratações usam `todos`, `recebendo_proposta` ou `propostas_encerradas`. Os filtros incompatíveis são recusados pelo serviço do Worker mesmo quando enviados diretamente.

Contratos projetam fornecedor, CPF/CNPJ, valor global, assinatura, vigência, tipo e nota fiscal. Seu sequencial não é usado como sequencial de compra para consultar itens. Detalhes e CSV mantêm os dados próprios do contrato e o link público correspondente.

## Demonstração e cobertura

A demonstração contém 64 contratações com dois itens e resultados sintéticos, além de 24 atas e 32 contratos. Todos os filtros são simulados. Critérios sobre filhos são independentes; essa simulação não certifica correlação na API real. Os status de atas e contratos usam a data de referência fixa `2026-10-07`; status de propostas e relevância não reproduzem a fonte.

A suíte verifica o envio individual dos 80 filtros na pesquisa e no CSV; formatos inválidos, contextos, todos os intervalos, zeros, ausência, precisão, IDs alfabéticos, domínios, aliases, seleção múltipla e campos de contrato. Os testes de interface cobrem edição de Não, troca documental e descarte de resposta atrasada. O Chromium percorre todos os 71 controles de contratações, os 16 de atas e os 32 de contratos, além de consultar detalhes e baixar CSV. Consulte [Testes e validação](validacao.md) para os resultados e comandos.

## Alcance da evidência externa

Há controles reais dos filtros documentais e de critérios, categorias, benefícios, incentivo e margens aplicáveis. Eles verificaram campos do índice ou detalhes de contratações selecionadas; condições verdadeiras coexistiram com itens falsos nos detalhes. As respostas não formam um snapshot.

A integração direta do navegador está registrada em [`evidencias-browser-implementacao.json`](evidencias-browser-implementacao.json): pesquisas dos três tipos, filtros, sugestões, catálogos, detalhes e listagens foram consultados no Firefox. O [guia de validação](validacao.md) informa os recursos com respostas positivas, listas vazias ou erros nas amostras e as verificações ainda necessárias na origem publicada.

Uma resposta válida, zero registros ou mudança de total não prova isoladamente o predicado. A homologação integral de todos os filtros, valores, combinações, limites e correlações continua limitada pelos erros intermitentes e pela ausência de controles positivos para algumas condições. Isso é registrado como limite de evidência, sem deixar a implementação do catálogo pendente. Não há garantia de disponibilidade contínua, estabilidade da indexação ou snapshot; falhas reais são exibidas como erros e nunca ativam a demonstração automaticamente.
