# Serviço do navegador e consultas ao PNCP

Este guia descreve `service.call(method, payload, {signal, onProgress})`, usado pela interface para comunicar-se com o Web Worker. A hospedagem entrega somente arquivos estáticos. Os formatos de critérios/dados mantêm `api_version: "2.0"`, com `edital`, `ata` e `contrato`.

O Worker consulta `https://pncp.gov.br/api/search/` para pesquisa, filtros e sugestões e `https://pncp.gov.br/api/pncp/v1` para detalhes, listagens e catálogos. A [arquitetura](arquitetura.md) descreve a ponte e o [guia de configuração](configuracao.md) informa os limites públicos.

| Método | Payload | Resultado |
| --- | --- | --- |
| `schema` | `{}` | Colunas, filtros, status, ordenações e limites |
| `execute` | `{query}` | Uma página de documentos e metadados |
| `domains` | `{type, normatives, field}` | Opções normalizadas e avisos; `normatives` e `field` podem ser omitidos |
| `suggest` | `{type, field, q, size}` | Sugestões de IDs e rótulos |
| `details` | `{document, page, size}` | Quantidade e página de itens de contratação |
| `related` | `{document, resource, page, size}` | Listagem vinculada a uma contratação |
| `documentDetails` | `{document}` | Campos completos de ata ou contrato |
| `documentRelated` | `{document, resource, page, size, pagination_mode?}` | Listagem dos detalhes de qualquer tipo documental |
| `contractChild` | `{document, resource, sequence}` | Detalhes do registro filho de contrato |
| `export` | `{query}` | Buffers CSV, nome, MIME e metadados compactos |

Esses métodos são locais, não URLs HTTP. Campos e métodos desconhecidos são rejeitados antes da consulta à fonte. Cancelamento rejeita a chamada com `AbortError`; erros do Worker preservam `code`, `message`, `status`, `details` e `retryable`.

## Pesquisa

`service.call("execute", {query})` recebe os critérios abaixo. Campos desconhecidos são rejeitados.

| Campo | Padrão | Valores aceitos |
| --- | --- | --- |
| `api_version` | `"2.0"` | `"2.0"` |
| `document_type` | `"edital"` | `"edital"`, `"ata"` ou `"contrato"` |
| `q` | `""` | Texto de até 128 caracteres |
| `status` | `"todos"` | Em edital: `"todos"`, `"recebendo_proposta"`, `"propostas_encerradas"`; em ata e contrato: `"todos"`, `"vigente"`, `"nao_vigente"` |
| `pncp_filters` | `{}` | Objeto de filtros habilitados |
| `order` | `"-data"` | `"-data"` (mais recentes), `"data"` (mais antigas), `"relevancia"` (exige texto não vazio) |
| `page` | `1` | Inteiro positivo; `page × size` não pode superar 10.000 |
| `size` | `PNCP_PAGE_SIZE`, inicialmente `50` | `10`, `25`, `50` ou `100` |

Todos os campos podem ser omitidos para usar os padrões. A interface envia explicitamente `size: 100`.

O cliente serializa os controles como `tipos_documento`, `q`, `status`, `ordenacao`, `pagina` e `tam_pagina`. As listas de filtros são unidas por `|` e codificadas uma vez. Cada página faz uma chamada de busca, além de eventuais consultas de domínios e novas tentativas em caso de falha transitória.

### URL compartilhável da interface

Os parâmetros GET da página são lidos pela interface estática e convertidos no payload de `execute`:

| Parâmetro | Padrão | Formato |
| --- | --- | --- |
| `tipos_documento` | `edital` | Um tipo: `edital`, `ata` ou `contrato` |
| `q` | Vazio | Texto de até 128 caracteres, codificado pela URL |
| `status` | `todos` | Status temporal compatível com o tipo documental |
| `ordenacao` | `-data` | `-data`, `data` ou `relevancia`; relevância exige texto |
| `pagina` | `1` | Inteiro de 1 a 100; a interface usa 100 registros por página |
| Nome de filtro habilitado | Ausente | Tipo e compatibilidade publicados no catálogo |

Listas aceitam `ufs=SP%7CDF` ou parâmetros repetidos como `ufs=SP&ufs=DF`; a URL gerada usa uma única lista separada por pipe e codificada uma vez. Booleanos exigem `true` ou `false`, inclusive quando o valor é Não. Inteiros preservam zero; decimais permanecem strings com ponto, sem perda de precisão; IDs e código IBGE preservam zeros à esquerda. Datas usam `AAAA-MM-DD`. Controles e filtros de valor único não aceitam parâmetros repetidos. Valores vazios, tipos incompatíveis, datas inválidas e intervalos invertidos produzem aviso e impedem a pesquisa inicial, sem remover silenciosamente filtros.

A inicialização e o recarregamento consultam diretamente a página indicada. Aplicar texto/filtros, trocar ordenação ou tipo começa na página 1; paginação atualiza `pagina`. A URL muda ao iniciar a consulta, inclusive quando ela falha ou é cancelada. Atualizar e repetir uma falha mantêm a página; operações idênticas não criam entradas duplicadas. Voltar/Avançar leem a URL, cancelam consultas anteriores, restauram controles/colunas e consultam o PNCP sem inserir outra entrada no histórico. Respostas tardias não alteram a URL nem os resultados atuais.

`tipos_documento`, `ordenacao` e `pagina` ficam explícitos na URL; texto vazio, status `todos` e filtros ausentes são omitidos. O caminho da hospedagem, o fragmento e parâmetros externos são preservados, incluindo `demo=1`; somente os controles e filtros reconhecidos tornam-se critérios do PNCP. A validação de pertencimento aos domínios continua no Worker. A URL compartilha critérios e página, sem garantir uma fotografia dos resultados da fonte.

### Filtros habilitados por padrão

| Campos | Formato |
| --- | --- |
| `ufs` | Lista de siglas, por exemplo `["DF", "GO"]` |
| `orgaos`, `unidades`, `municipios` | Listas de IDs numéricos como strings, obtidos dos domínios ou sugestões |
| `codigo_ibge` | String com exatamente sete dígitos, por exemplo `"5300108"`; não é o ID de `municipios` |
| `srp` | Booleano `true` ou `false`; omitir o filtro não restringe por SRP |
| `indicador_orcamento_sigiloso`, `exigencia_conteudo_nacional` | Booleanos `true` ou `false` da contratação |
| `possui_emenda_parlamentar` | Booleano `true` ou `false` de vínculo com emenda parlamentar |
| `tem_ata_registro_preco`, `tem_contrato_empenho`, `tem_nfe_contrato` | Booleanos de vínculo da contratação com ata, contrato ou empenho e nota fiscal do contrato, respectivamente |
| `fontes` | Lista de IDs dos sistemas de origem conferidos no domínio do PNCP; corresponde a `usuario_id`, não à fonte orçamentária |
| `modos_disputa` | Lista de IDs de modos de disputa conferidos no domínio do PNCP |
| `tipos` | Lista de IDs de instrumentos convocatórios conferidos no domínio do PNCP |
| `fontes_orcamentarias` | Lista de IDs conferidos no domínio do PNCP |
| `normativos_base`, `amparos_legais` | Listas de IDs; os amparos são conferidos no domínio condicionado pelos normativos selecionados |
| `esferas` | Lista com `F`, `E`, `M`, `D` ou `N` |
| `poderes` | Lista com `E`, `L`, `J` ou `N` |
| `modalidades`, `situacoes` | Listas de IDs como strings, conferidos no domínio do PNCP |
| `situacoes_item` | Lista de IDs como strings, conferidos em `item_situacoes` |
| `tipos_item` | String única: `"S"` (serviço) ou `"M"` (material) |
| `criterios_julgamento` | Lista de IDs conferidos no domínio de mesmo nome |
| `categorias_leilao` | Lista de IDs conferidos em `item_categorias_leilao`; não restringe implicitamente a modalidade |
| `beneficios` | Lista de IDs conferidos em `item_beneficios`; condição aplicável ao item, distinta de benefício aplicado no resultado |
| `incentivo_produtivo_basico` | Booleano `true` ou `false` |
| `aplicabilidade_margem_preferencia_normal`, `aplicabilidade_margem_preferencia_adicional` | Booleanos `true` ou `false` de aplicabilidade no item; não indicam que a preferência foi aplicada ao resultado |
| `anos` | Lista de anos no formato `AAAA`, como `["2026"]` |
| `data_publicacao_inicio`, `data_publicacao_fim` | Datas reais no formato `AAAA-MM-DD` |
| `valor_total_estimado_min`, `valor_total_estimado_max` | Decimais não negativos como strings com ponto, por exemplo `"1000.50"` |
| `valor_total_homologado_min`, `valor_total_homologado_max` | Mesmo formato decimal |

Todos os filtros restantes também estão implementados. A notação `min/max` e `inicio/fim` abaixo representa parâmetros separados:

| Filtros | Formato e domínio |
| --- | --- |
| `orgaos_subrogados`, `unidades_subrogadas`, `fornecedores` | Listas de IDs numéricos em strings, obtidos por opções parciais ou sugestões; edital e contrato |
| `permite_adesao` | Booleano; edital, ata e contrato |
| `tipos_margens_preferencia` | ID único em string, conferido no domínio; edital e contrato |
| `unidades_medida` | Lista de textos em `item_unidades_medida`, preservando caixa e espaços |
| `item_quantidade_min/max`, `item_valor_unitario_estimado_min/max`, `item_valor_total_estimado_min/max` | Decimais não negativos em strings |
| `situacoes_resultado` | Lista de IDs conferidos em `resultado_item_situacoes` |
| `reservas_remanescentes` | Lista de IDs: `"1"` Não se aplica, `"2"` Remanescente, `"3"` Cadastro de reserva |
| `ordem_classificacao_min/max` | Inteiros JSON não negativos e seguros; zero é preservado |
| `indicador_subcontratacao`, `indicador_aplicacao_margem_preferencia`, `indicador_aplicacao_beneficio_me_epp`, `indicador_aplicacao_criterio_desempate` | Booleanos do resultado, distintos das condições de aplicabilidade do item |
| `data_homologacao_inicio/fim` | Datas reais `AAAA-MM-DD`, referentes ao resultado |
| `resultado_quantidade_homologado_min/max`, `resultado_valor_unitario_homologado_min/max`, `resultado_valor_total_homologado_min/max` | Decimais não negativos em strings |
| `resultado_percentual_desconto_min/max` | Decimais em strings entre `"0"` e `"100"`, sem `%` |
| `municipios_fornecedor` | Lista de IDs numéricos em strings, fornecidos por sugestões |
| `paises_fornecedor` | Lista de IDs alfabéticos de três letras do catálogo, como `"BRA"`; não enviar códigos BCB |
| `portes_fornecedor`, `naturezas_juridicas` | Listas de IDs numéricos em strings, conferidas nos catálogos; zeros à esquerda são preservados |
| `tipos_contrato` | Lista de IDs conferidos no domínio de contratos; exclusivo de contrato |
| `possui_nfe` | Booleano exclusivo de contrato |
| `fornecedores_subcontratados` | Lista de IDs numéricos em strings obtidos por opções parciais ou sugestões; exclusivo de contrato |
| `data_assinatura_inicio/fim`, `data_inicio_vigencia_inicio/fim` | Datas reais `AAAA-MM-DD`; ata e contrato; o segundo intervalo restringe a data de início da vigência |
| `valor_global_min/max` | Decimais não negativos em strings; exclusivo de contrato |

Filtros de itens, resultados e características de fornecedores nessa tabela são exclusivos de edital, exceto onde indicado. Confira `documents` no esquema para a compatibilidade dos demais campos. Intervalos invertidos são rejeitados antes da rede; decimais são comparados sem conversão para ponto flutuante.

As listas devem conter de 1 a 100 strings; não envie nomes de órgãos no lugar dos IDs nem caracteres `|` dentro dos valores. Os intervalos devem ter início ou mínimo menor ou igual ao fim ou máximo. `status` representa o período de recebimento de propostas em editais e a vigência em atas/contratos; `situacoes` é um filtro separado de situação da contratação.

Booleanos exigem valores JSON, sem aspas: `false` é enviado ao PNCP como `false`, e não descartado. Omitir o argumento não restringe por aquela condição. Ausência de informação não é convertida em `false`; na demonstração, registros com `null` ficam fora tanto de Sim quanto de Não. `tem_nfe_contrato` é um vínculo da contratação; `possui_nfe` continua exclusivo de contratos e indisponível para `edital`. Não há exclusões automáticas de modos de disputa por modalidade: os critérios são enviados juntos à fonte.

```json
{"api_version":"2.0","document_type":"edital","q":"firewall","pncp_filters":{"fontes":["3","5"],"modos_disputa":["1","3"],"indicador_orcamento_sigiloso":false,"tem_contrato_empenho":true},"page":1,"size":10}
```

Filtros de itens selecionam **contratações** na busca nativa. Tabela e CSV continuam contendo uma linha por contratação. Os detalhes exibem todos os itens, inclusive os que não satisfazem os critérios. Uma condição verdadeira na busca pode coexistir com itens que a informam como falsa nos detalhes. Não há garantia de que condições diferentes incidam sobre o mesmo item; a aplicação não aplica um refinamento local para impor essa correlação. Os nomes enviados à busca continuam sendo `categorias_leilao` e `beneficios`, embora os domínios usem aliases.

`service.call("schema")` informa `columns`, `columns_by_document`, `capabilities`, `statuses`, `statuses_by_document`, `orders` e `limits`. O catálogo em [`src/pncp-arguments.json`](../src/pncp-arguments.json) contém 87 argumentos: sete reservados ao adaptador e 80 filtros implementados, sem pendências. São 71 de edital, 16 de ata e 32 de contrato. `columns` e `statuses` mantêm os padrões de edital; os mapas por documento fornecem os valores próprios de cada tipo. A compatibilidade de filtros é definida por `documents`.

Atas aceitam `ufs`, `orgaos`, `unidades`, `municipios`, `esferas`, `poderes`, `anos`, `modalidades`, `tipos`, `permite_adesao`, `data_publicacao_inicio/fim`, `data_assinatura_inicio/fim` e `data_inicio_vigencia_inicio/fim`. Filtros de itens, resultados e valores contratuais não são aplicáveis a atas.

Cada capacidade também informa `label`, `group`, `input_hint`, `cardinality`, `domain_source`, `domain_kind`, `evidence` e `validation_status`. O tipo `enum` é singular: `tipos_item` e `tipos_margens_preferencia` usam uma string escolhida no domínio. `sampled_live` registra filtros com controles reais documentados; `integration_tested` registra cobertura da aplicação, sem homologação integral da fonte; `operator_declared` declara conferência externa via [PNCP_VALIDATED_FILTERS](configuracao.md#habilitar-filtros-adicionais).

### Resposta da pesquisa

| Campo | Significado |
| --- | --- |
| `data` | Documentos da página, na ordem retornada pelo PNCP |
| `document_type` | Tipo documental solicitado |
| `page`, `size`, `last_page` | Paginação solicitada e última página acessível |
| `total`, `source_total` | Total informado pela fonte |
| `accessible_total`, `last_row` | Menor valor entre o total e 10.000 |
| `window_limited` | Indica que o total ultrapassa a janela de 10.000 documentos |
| `collection_complete` | `false` na resposta de uma página de pesquisa |
| `snapshot_guaranteed` | `false`: a fonte pode mudar entre chamadas |
| `source`, `demo` | Fonte utilizada (`pncp` ou `demo`) e indicação de demonstração |
| `request_id`, `api_version` | Identificação da operação e versão do contrato |
| `started_at`, `finished_at`, `elapsed_ms` | Início, término e duração da operação |
| `upstream_requests` | Número de chamadas à fonte, incluindo domínios e tentativas |
| `effective_filters` | Critérios enviados, com os nomes nativos do PNCP |
| `warnings` | Avisos, como janela limitada ou identidade ausente |

Com zero resultados, `data` é vazio e `last_page` é `1`. Uma página além do resultado atual gera `PAGE_OUT_OF_RANGE`.

Os campos documentais são definidos em [`src/schema.js`](../src/schema.js). Cada documento também contém `_identity`, `_document`, `_purchase` e `_raw`: identidade de negócio, identificadores originais por tipo, identificadores de itens (somente editais) e registro original convertido para JSON. Valores monetários projetados são strings decimais, e ausências são `null`. O tipo documental vem de `document_type`; `doc_type` é metadado do índice. Nos dados originais e itens, inteiros seguros podem ser números; decimais e inteiros fora da faixa segura são preservados como strings.

## Domínios e sugestões

`service.call("domains", {type, normatives, field})` aceita `type: "edital"`, `"ata"` ou `"contrato"`, `normatives` como lista de IDs e `field` com o nome de um filtro que possui domínio. Campos desconhecidos ou incompatíveis com o documento são rejeitados. Retorna `filters`, `warnings`, `raw`, `partial_domains`, `request_id` e `queried_at`. As opções são normalizadas para `{id, label}`. Opções de ano fora de `AAAA` são omitidas da lista normalizada com aviso; a resposta original fica em `raw`.

Sem `field`, ou com um filtro da busca, a origem é `/api/search/filters`. Para os campos abaixo, apenas o catálogo solicitado é consultado:

| `field` | Endpoint PNCP | Identidade preservada |
| --- | --- | --- |
| `paises_fornecedor` | `/api/pncp/v1/paises` | ID textual, como `BRA`; não é convertido para `codigoPaisBcb` |
| `portes_fornecedor` | `/api/pncp/v1/portes-empresa` | ID como string |
| `naturezas_juridicas` | `/api/pncp/v1/naturezas-juridicas` | ID com zeros à esquerda, como `0000` |
| `situacoes_resultado` | `/api/pncp/v1/situacoes-compra-item-resultado` | ID como string, normalizado em `resultado_item_situacoes` |

Opções desses catálogos podem incluir `active: false`; a interface distingue opções inativas sem descartar registros históricos. O aplicativo valida e envia os IDs do catálogo de países, sem conversão BCB. O alcance da verificação do predicado remoto está no [guia dos filtros](viabilidade-filtros-pncp.md).

Domínios fechados são conferidos pelo Worker antes da pesquisa e da exportação. Reservas/remanescentes usam a enumeração fixa do portal, com `domain_source: reference` e sem requisição externa para obter essas opções. Domínios parciais utilizam sugestões e não são tratados como listas exaustivas; incluem sub-rogação, fornecedores, municípios de fornecedores e unidades de medida.

Na inicialização, a interface pré-carrega em segundo plano as opções de `edital`, `ata` e `contrato`, os quatro catálogos compartilhados e a referência fixa. São oito operações locais `domains`, sete delas com consulta externa quando não há cache válido. As listas normalizadas ficam no `localStorage` por 4 horas desde o carregamento, sem renovar a validade em leituras. Abrir filtros ou trocar o campo reutiliza a lista correspondente; entradas vencidas são descartadas e obtidas novamente na inicialização ou no próximo uso. Falhas de uma lista não bloqueiam a pesquisa nem as demais listas; armazenamento indisponível usa memória. O cache não altera as consultas de validação do Worker, pesquisa, detalhes, CSV ou sugestões por texto.

Ao adicionar ou remover normativos, a interface obtém os amparos do cache específico do tipo e conjunto de normativos ou faz uma consulta ao PNCP. Preserva os válidos e remove os incompatíveis com aviso. Essas listas dependentes são carregadas sob demanda e têm a mesma validade de 4 horas; as demais opções reutilizam o domínio inicial. Enquanto essa conferência está em andamento, **Aplicar e pesquisar** fica desabilitado. Em caso de falha, remova o filtro de amparo ou adicione novamente o normativo para repetir a conferência.

`service.call("suggest", payload)` recebe:

| Parâmetro | Regra |
| --- | --- |
| `type` | `edital`, `ata` ou `contrato`; padrão `edital` |
| `field` | Nome de um filtro habilitado do tipo lista |
| `q` | Texto entre 3 e 128 caracteres |
| `size` | Inteiro de 1 a 20; padrão `20` |

A resposta contém `items` com pares `{id, label}`, `request_id` e `queried_at`. Listas de domínios podem ser parciais; o retorno de sugestões depende da fonte.

## Itens de uma contratação

`service.call("details", {document, page, size})` exige `document: {type: "edital", cnpj, ano, sequencial}`, com CNPJ de 14 dígitos, ano de quatro dígitos e sequencial numérico positivo, todos como strings. `page` deve ser um inteiro positivo e `size` aceita 10, 25, 50 ou 100.

Cada requisição consulta a quantidade de itens e, quando o total é positivo, a página pedida. O serviço verifica se a quantidade de itens recebida corresponde ao total informado. Retorna `data`, `page`, `size`, `total_items`, `total_pages`, `has_more`, `complete`, `source`, `api_version`, `request_id`, `queried_at`, `upstream_requests`, `pagination_note` e `snapshot_guaranteed: false`. `complete` indica que a página atual é a última; não significa que todas as páginas foram baixadas.

A interface consulta os itens ao abrir os detalhes e ao navegar entre suas páginas. Quando faltam identificadores originais válidos, informa a ausência e não faz uma chamada de itens.

## Listagens nos detalhes de uma contratação

`service.call("documentRelated", {document, resource, page, size})` usa os mesmos identificadores de contratação e os parâmetros `page` e `size` dos itens. Ao abrir os detalhes, a interface inicia as primeiras páginas dessas listagens e dos itens em segundo plano, com até duas requisições simultâneas. Pede dez registros por página nas quatro listagens e 100 nos itens. Cada aba preserva seu próprio estado e permite repetir uma consulta que falhou. Trocar de aba não faz nova consulta; mudar sua página consulta novamente a fonte. Fechar os detalhes, abrir outra contratação ou trocar o tipo documental cancela chamadas ativas e pendentes.

O painel tem largura de até 888 pixels e começa na aba **Detalhes**, com 12 campos documentais. Seu contador indica os campos exibidos; os contadores das outras cinco abas indicam o total de registros informado pela fonte, independentemente da página atual. `…` indica carregamento; `—` indica falha ou identificação insuficiente. Zero é mostrado somente quando confirmado pela fonte. As abas podem ser percorridas por setas, Home e End; em telas menores, a barra permite rolagem horizontal. Os links externos ficam no cabeçalho junto ao botão de fechar.

| Recurso | Campos em `data` | Serviço externo, relativo a `PNCP_DETAIL_BASE_URL` |
| --- | --- | --- |
| `arquivos` | `titulo`, `tipo`, `data_publicacao`, `url` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` e `/arquivos/quantidade` |
| `atas` | `numero`, `numero_controle_pncp`, `data_assinatura`, `vigencia_inicio`, `vigencia_fim`, `data_cancelamento`, `url` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/atas` |
| `contratos` | `numero`, `numero_controle_pncp`, `data_assinatura`, `vigencia_inicio`, `vigencia_fim`, `fornecedor_nome`, `valor_global`, `url` | `/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}` |
| `historico` | `evento`, `nome`, `data_evento`, `justificativa` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/historico` e `/historico/quantidade` |

Todos os serviços de página recebem `pagina` e `tamanhoPagina`. Arquivos e histórico retornam listas; atas e contratos retornam um objeto com `data` e `totalRegistros`. HTTP 204 na listagem equivale a uma página sem registros. Na listagem de **Contratos/Empenhos**, HTTP 404 do serviço PNCP também significa ausência de registros: a aplicação retorna uma lista vazia com total zero e a aba exibe `Contratos/Empenhos (0)`. Quantidade ausente, outros HTTP de erro, formato inesperado ou divergência entre página e total são reportados como erros. HTTP 404 nas demais listagens continua sendo erro, salvo nas listas de empenhos e instrumentos de cobrança de um contrato, descritas abaixo.

A resposta da aplicação contém `api_version`, `request_id`, `source`, `resource`, `data`, `page`, `size`, `total`, `total_pages`, `has_more`, `complete`, `snapshot_guaranteed: false`, `queried_at` e `upstream_requests`. `complete` identifica a última página. `valor_global` preserva os decimais como string. `url` é `null` quando o link de download é inválido ou os identificadores do registro não permitem gerar um link de acesso. O link de ata usa o ano da compra presente no número de controle PNCP, que pode diferir de `anoAta`.

O histórico apresenta o evento, o nome do documento quando fornecido, a data/hora e a justificativa. Uma justificativa ausente ou vazia é apresentada como `Exigência Legal`, seguindo o portal oficial. Textos são exibidos como texto; downloads aceitam apenas HTTP/HTTPS sem credenciais, e os links de atas e contratos apontam para o PNCP. Listagens não são consultadas durante pesquisa ou exportação. Quando faltam identificadores originais válidos, as seções mostram essa informação e não fazem requisições.

A demonstração fornece arquivos, atas, contratos/empenhos e eventos fictícios, incluindo listas vazias, cancelamento, mais de uma página e valores monetários exatos. Seus links de documentos/registro são ilustrativos e não garantem a existência desses dados no PNCP.

## Detalhes de atas e contratos

`service.call("documentDetails", {document})` consulta os dados completos. Os identificadores são strings:

| Tipo | `document` | Serviço externo relativo a `PNCP_DETAIL_BASE_URL` |
| --- | --- | --- |
| Ata | `{type: "ata", cnpj, ano, sequencial_compra, sequencial}` | `/orgaos/{cnpj}/compras/{anoCompra}/{sequencialCompra}/atas/{sequencialAta}` |
| Contrato | `{type: "contrato", cnpj, ano, sequencial}` | `/orgaos/{cnpj}/contratos/{ano}/{sequencial}` |

A pesquisa fornece `_document` com os identificadores originais e o tipo. Em atas, `numero_sequencial_compra_ata` identifica a compra e `numero_sequencial` identifica a ata; o ano da rota é o da compra. Quando a URL original de detalhamento é fornecida, seu ano tem precedência sobre `ano` da busca, após conferir CNPJ e os dois sequenciais. Uma URL conflitante torna a identidade indisponível. O ano da ata pode ser diferente. Em contratos, o sequencial é do contrato. `_purchase` é exclusivo de editais e não permite consultar itens com um sequencial de ata ou contrato.

As respostas completas contêm `api_version`, `document_type`, `fields`, `objeto`, `link_sistema_origem`, `queried_at` e `upstream_requests`. Cada entrada de `fields` tem `field`, `title`, `type` e `value`; vínculos têm também `url`. Valores monetários são strings exatas, IDs preservam zeros e booleanos mantêm ausência distinta de `false`. Campos opcionais ausentes são omitidos. O controle PNCP precisa corresponder ao documento solicitado.

Nos detalhes de contratos, `emendaParlamentar` é booleano: `false` exibe **Não** e `true` exibe **Sim** no campo **Emenda parlamentar**. Ausência ou `null` omite o campo opcional, sem assumir **Não**.

Atas mostram identificação, órgão/unidade, modalidade, assinatura, vigência, cancelamento, adesão, contratação de origem e informações complementares. Contratos mostram identificação, órgão/unidade e sub-rogação, processo/categoria, fornecedor e subcontratado, assinatura, vigência, valores inicial/global/acumulado e parcelas, adesão, remanejamento, vínculos com contratação/ata, CIPI e informações complementares, conforme disponibilidade da fonte. Esses campos são consultados novamente ao abrir o painel. Uma falha mantém os campos disponíveis na busca, informa o erro e oferece nova tentativa.

`documentRelated` recebe os identificadores originais, `resource`, `page` e `size`. A interface pede página 1 e dez registros; os tamanhos permitidos são 10, 25, 50 e 100. O formato de paginação é o mesmo das listagens de contratações, com a exceção de histórico de contrato com contagem inconsistente descrita abaixo.

| Tipo | Recursos | Dados e formato externo |
| --- | --- | --- |
| Ata | `partesenvolvidas` | `fields`: tipo de parte, órgão/CNPJ, unidade/código, município/UF e inclusão; envelope paginado |
| Ata | `contratos` | Identificação, órgão, fornecedor, assinatura, vigência, valor e link dos contratos vinculados; envelope paginado |
| Ata e contrato | `arquivos`, `historico` | Mesmo formato dos arquivos/histórico de contratações; contagem em `/{recurso}/quantidade` |
| Contrato | `termos` | `fields` e `sequencial`: número, tipo, assinatura, objeto, prazo, vigência, valores, parcelas e observações; lista e contagem separada |
| Contrato | `empenhos` | `fields` e `sequencial`: número, valor total, emenda, emissão, inclusão, situação e credor/fornecedor; envelope paginado |
| Contrato | `instrumentocobranca` | `fields` e `sequencial`: número, tipo, datas, observações, chave NF-e e demais dados disponíveis; lista sem paginação externa |

Os serviços externos usam o mesmo sufixo da rota completa do documento. Instrumentos de cobrança são consultados integralmente a cada página; o Worker recorta sua apresentação e identifica `pagination_source: local_slice`. Os outros recursos identificam `pagination_source: pncp`. Esse recorte não altera a busca documental nem seus totais.

Se a página do **Histórico** de um contrato divergir da contagem do PNCP, os eventos recuperados são preservados e a resposta usa `total: null`, `total_pages: null` e `pagination_mode: "until_empty"`. A aba exibe **Histórico (?)** e informa **Quantidade desconhecida**. A página é consultada mesmo quando a contagem informa zero ou aponta um número menor de páginas.

Nesse modo, a interface envia `pagination_mode: "until_empty"` nas consultas seguintes do mesmo painel, sem consultar novamente a contagem. `has_more` é `true` enquanto a página contém registros, inclusive páginas incompletas; significa que é possível tentar a próxima página, não que ela certamente contém registros. Uma página vazia (lista vazia ou HTTP 204) retorna `has_more: false` e `complete: true`, mostra o fim do histórico e desabilita **Próxima**, mantendo **Anterior** disponível quando aplicável. O total continua desconhecido. O indicador mostra somente **Página N**, sem inventar um número de páginas. Abrir outro documento reinicia esse estado.

`pagination_mode` é opcional e aceita somente `"until_empty"`, exclusivamente para `historico` de `contrato`. Contagens coerentes conservam a paginação normal. Formatos ou registros inválidos, respostas maiores que a página solicitada, falhas HTTP/de transporte e contagens ilegíveis continuam sendo erros; a exceção não se aplica ao histórico de atas/contratações, às demais listas, à busca ou ao CSV.

Nas listas `empenhos` e `instrumentocobranca` de contratos, HTTP 404 retorna `data: []`, `total: 0`, `total_pages: 1`, `has_more: false` e `complete: true` na página 1. As abas exibem **Empenhos (0)** e **Instrumentos de cobrança (0)**, com mensagem de lista vazia e sem botão de nova tentativa. Páginas além da primeira são recusadas como `PAGE_OUT_OF_RANGE`. Outros erros HTTP, falhas de transporte e respostas inválidas continuam sendo erros; HTTP 404 em `contractChild` também continua sendo erro.

O painel começa em **Detalhes** e carrega os dados completos e todas as primeiras páginas em segundo plano, com até duas requisições simultâneas. Atas têm abas **Detalhes**, **Partes envolvidas**, **Contratos**, **Arquivos** e **Histórico**; contratos têm **Detalhes**, **Empenhos**, **Instrumentos de cobrança**, **Termos**, **Arquivos** e **Histórico**. O contador de Detalhes corresponde aos campos exibidos; os demais correspondem aos totais das listagens. Cancelamento, teclado, paginação, erros e nova tentativa seguem o comportamento de contratações.

Em contratos, `service.call("contractChild", {document, resource, sequence})` consulta o filho escolhido, com `sequence` como string numérica positiva: `empenhos` e `instrumentocobranca` retornam `fields`; `termos` consulta o sufixo externo `/termos/{sequencialRegistro}/arquivos` e retorna `files`, no formato dos arquivos. Esses dados carregam ao abrir **Ver detalhes** ou **Arquivos do termo** na lista. Não há exposição de JSON bruto no painel.

## Exportação

`service.call("export", {query}, {signal, onProgress})` coleta novamente os critérios da última pesquisa concluída, a partir da primeira página. `onProgress` recebe `{pages, rows, total, bytes}`.

```js
const query = {
  api_version: '2.0', document_type: 'edital', q: 'firewall',
  status: 'todos', pncp_filters: {ufs: ['DF']}, order: '-data', page: 1, size: 100,
};
const page = await service.call('execute', {query});
const csv = await service.call('export', {query}, {signal, onProgress});
const blob = new Blob(csv.chunks, {type: csv.mime});
```

O resultado contém `chunks` como `ArrayBuffer[]`, `mime`, `filename` e `metadata`. Os metadados incluem `exported_rows`, totais, critérios, tempos, chamadas e `collection_complete: true`, sem `data` com a coleção de documentos. O CSV contém BOM UTF-8, cabeçalho, CRLF e valores entre aspas; aspas internas são duplicadas e decimais mantêm sua representação exata, sem formatação monetária.

Total acima do limite, mudança de total, duplicação, identidade ausente, página incompleta, cancelamento e limites de bytes interrompem a operação. Buffers são transferidos somente após conclusão; não há download parcial. A interface revoga a URL do Blob após o download. `snapshot_guaranteed` continua sendo `false`.

## Erros e diagnóstico

A ponte rejeita a promessa com um erro tipado. `status` é um código da aplicação; `details.upstream_status` só existe quando houve uma resposta HTTP legível do PNCP. CORS, TLS e offline podem produzir `PNCP_TRANSPORT_ERROR` sem um HTTP conhecido.

| Código | Ação |
| --- | --- |
| `UNKNOWN_FIELD`, `INVALID_DOMAIN`, `INVALID_SIZE` | Corrigir os critérios |
| `DOCUMENT_FILTER_UNAVAILABLE`, `DOMAIN_UNAVAILABLE` | Conferir tipo documental e disponibilidade do domínio |
| `SOURCE_CHANGED` | Repetir a coleta; a fonte mudou entre chamadas |
| `PAGE_OUT_OF_RANGE`, `EXPORT_TOO_BROAD`, limites de recursos | Ajustar página, limites ou escopo da pesquisa |
| `CONCURRENCY_LIMIT` | Aguardar outras operações e repetir |
| `INVALID_UPSTREAM`, `PNCP_HTTP_ERROR` | Conferir a resposta legível da fonte |
| `PNCP_UNAVAILABLE`, `PNCP_TRANSPORT_ERROR`, `PNCP_TIMEOUT`, `OPERATION_TIMEOUT` | Verificar conectividade e prazo; repetir conforme o erro |
| `INCOMPATIBLE_VERSION`, `WORKER_UNAVAILABLE`, `WORKER_TIMEOUT` | Reabrir a página e conferir a publicação dos arquivos |

O Worker usa IDs para associar chamadas, progresso, resultados e cancelamento. `pncp-diagnostic.html` verifica a integração real na origem publicada e permite salvar a evidência. Consulte [Testes e validação](validacao.md) para alcance e procedimentos.
