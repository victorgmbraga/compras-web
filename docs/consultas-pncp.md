# Contrato da API e consultas ao PNCP

A API da aplicação usa a versão `2.0` e habilita `edital` (contratações) e `contrato`. O servidor consulta `https://pncp.gov.br/api/search/` para pesquisas e `https://pncp.gov.br/api/pncp/v1` para itens e catálogos. Os endereços são configuráveis conforme o [guia de configuração](configuracao.md).

## Pesquisa

`POST /api/query` recebe um objeto JSON com `Content-Type: application/json`. O corpo tem limite de 256 KiB, e campos desconhecidos são rejeitados.

| Campo | Padrão | Valores aceitos |
| --- | --- | --- |
| `api_version` | `"2.0"` | `"2.0"` |
| `document_type` | `"edital"` | `"edital"` ou `"contrato"` |
| `q` | `""` | Texto de até 128 caracteres |
| `status` | `"todos"` | Em edital: `"todos"`, `"recebendo_proposta"`, `"propostas_encerradas"`; em contrato: `"todos"`, `"vigente"`, `"nao_vigente"` |
| `pncp_filters` | `{}` | Objeto de filtros habilitados |
| `order` | `"-data"` | `"-data"` (mais recentes), `"data"` (mais antigas), `"relevancia"` (exige texto não vazio) |
| `page` | `1` | Inteiro positivo; `page × size` não pode superar 10.000 |
| `size` | `PNCP_PAGE_SIZE`, inicialmente `50` | `10`, `25`, `50` ou `100` |

Todos os campos podem ser omitidos para usar os padrões. A interface envia explicitamente `size: 100`.

```sh
curl --fail-with-body -sS http://localhost:8000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"api_version":"2.0","document_type":"edital","q":"firewall","status":"todos","pncp_filters":{"ufs":["DF"]},"order":"-data","page":1,"size":10}'
```

O servidor serializa os controles como `tipos_documento`, `q`, `status`, `ordenacao`, `pagina` e `tam_pagina`. As listas de filtros são unidas por `|` e codificadas uma vez. Cada página faz uma chamada de busca, além de eventuais consultas de domínios e novas tentativas em caso de falha transitória.

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
| `permite_adesao` | Booleano; edital e contrato |
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
| `data_assinatura_inicio/fim`, `data_inicio_vigencia_inicio/fim` | Datas reais `AAAA-MM-DD`; exclusivo de contrato; o segundo intervalo restringe a data de início da vigência |
| `valor_global_min/max` | Decimais não negativos em strings; exclusivo de contrato |

Filtros de itens, resultados e características de fornecedores nessa tabela são exclusivos de edital, exceto onde indicado. Confira `documents` no esquema para a compatibilidade dos demais campos. Intervalos invertidos são rejeitados antes da rede; decimais são comparados sem conversão para ponto flutuante.

As listas devem conter de 1 a 100 strings; não envie nomes de órgãos no lugar dos IDs nem caracteres `|` dentro dos valores. Os intervalos devem ter início ou mínimo menor ou igual ao fim ou máximo. `status` representa o período de recebimento de propostas; `situacoes` é um filtro separado de situação da contratação.

Booleanos exigem valores JSON, sem aspas: `false` é enviado ao PNCP como `false`, e não descartado. Omitir o argumento não restringe por aquela condição. Ausência de informação não é convertida em `false`; na demonstração, registros com `null` ficam fora tanto de Sim quanto de Não. `tem_nfe_contrato` é um vínculo da contratação; `possui_nfe` continua exclusivo de contratos e indisponível para `edital`. Não há exclusões automáticas de modos de disputa por modalidade: os critérios são enviados juntos à fonte.

```json
{"api_version":"2.0","document_type":"edital","q":"firewall","pncp_filters":{"fontes":["3","5"],"modos_disputa":["1","3"],"indicador_orcamento_sigiloso":false,"tem_contrato_empenho":true},"page":1,"size":10}
```

Filtros de itens selecionam **contratações** na busca nativa. Tabela e CSV continuam contendo uma linha por contratação. Os detalhes exibem todos os itens, inclusive os que não satisfazem os critérios. Uma condição verdadeira na busca pode coexistir com itens que a informam como falsa nos detalhes. Não há garantia de que condições diferentes incidam sobre o mesmo item; a aplicação não aplica um refinamento local para impor essa correlação. Os nomes enviados à busca continuam sendo `categorias_leilao` e `beneficios`, embora os domínios usem aliases.

`GET /api/schema` informa `columns`, `columns_by_document`, `capabilities`, `statuses`, `statuses_by_document`, `orders` e `limits`. O catálogo em [`src/pncp-arguments.json`](../src/pncp-arguments.json) contém 87 argumentos: sete reservados ao adaptador e 80 filtros implementados, sem pendências. São 71 de edital e 32 de contrato, com 23 compartilhados. `columns` e `statuses` mantêm os padrões de edital; os mapas por documento fornecem os valores próprios de contrato. A compatibilidade de filtros é definida por `documents`.

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

Os campos documentais são definidos em [`src/schema.js`](../src/schema.js). Cada documento também contém `_identity`, `_purchase` e `_raw`: identidade de negócio, identificadores para buscar itens e registro original convertido para JSON. Valores monetários projetados são strings decimais, e ausências são `null`. O tipo documental vem de `document_type`; `doc_type` é metadado do índice. Nos dados originais e itens, inteiros seguros podem ser números; decimais e inteiros fora da faixa segura são preservados como strings.

## Domínios e sugestões

`GET /api/pncp/filters` aceita `tipos_documento=edital` ou `contrato`, `normativos_base` com IDs separados por pipe e `campo` com o nome de um filtro que possui domínio. Campos desconhecidos ou incompatíveis com o documento são rejeitados. Retorna `filters`, `warnings`, `raw`, `partial_domains`, `request_id` e `queried_at`. As opções são normalizadas para `{id, label}`. Opções de ano fora de `AAAA` são omitidas da lista normalizada com aviso; a resposta original fica em `raw`.

Sem `campo`, ou com um filtro da busca, a origem é `/api/search/filters`. Para os campos abaixo, apenas o catálogo solicitado é consultado:

| `campo` | Endpoint PNCP | Identidade preservada |
| --- | --- | --- |
| `paises_fornecedor` | `/api/pncp/v1/paises` | ID textual, como `BRA`; não é convertido para `codigoPaisBcb` |
| `portes_fornecedor` | `/api/pncp/v1/portes-empresa` | ID como string |
| `naturezas_juridicas` | `/api/pncp/v1/naturezas-juridicas` | ID com zeros à esquerda, como `0000` |
| `situacoes_resultado` | `/api/pncp/v1/situacoes-compra-item-resultado` | ID como string, normalizado em `resultado_item_situacoes` |

Opções desses catálogos podem incluir `active: false`; a interface distingue opções inativas sem descartar registros históricos. O aplicativo valida e envia os IDs do catálogo de países, sem conversão BCB. O alcance da verificação do predicado remoto está no [guia dos filtros](viabilidade-filtros-pncp.md).

Domínios fechados são conferidos pelo backend antes da pesquisa e da exportação. Reservas/remanescentes usam a enumeração fixa do portal, com `domain_source: reference` e sem requisição externa para obter essas opções. Domínios parciais utilizam sugestões e não são tratados como listas exaustivas; incluem sub-rogação, fornecedores, municípios de fornecedores e unidades de medida.

Ao adicionar ou remover normativos, a interface consulta novamente os amparos, preserva os válidos e remove os incompatíveis com aviso. Enquanto essa conferência está em andamento, **Aplicar e pesquisar** fica desabilitado. Em caso de falha, remova o filtro de amparo ou adicione novamente o normativo para repetir a conferência.

`GET /api/pncp/suggest` recebe:

| Parâmetro | Regra |
| --- | --- |
| `tipos_documento` | `edital` ou `contrato`; padrão `edital` |
| `campo` | Nome de um filtro habilitado do tipo lista |
| `q` | Texto entre 3 e 128 caracteres |
| `tam_pagina` | Inteiro de 1 a 20; padrão `20` |

```sh
curl --fail-with-body -sS --get http://localhost:8000/api/pncp/suggest \
  --data-urlencode 'campo=orgaos' \
  --data-urlencode 'q=universidade' \
  --data-urlencode 'tam_pagina=10'
```

A resposta contém `items` com pares `{id, label}`, `request_id` e `queried_at`. Listas de domínios podem ser parciais; o retorno de sugestões depende da fonte.

## Itens de uma contratação

`GET /api/contratacoes/{cnpj}/{ano}/{sequencial}/itens` exige CNPJ com 14 dígitos, ano com quatro dígitos e sequencial numérico positivo. Aceita `pagina` (padrão `1`) e `tamanhoPagina` (`10`, `25`, `50` ou `100`; padrão `100`).

Cada requisição consulta a quantidade de itens e, quando o total é positivo, a página pedida. O servidor verifica se a quantidade de itens recebida corresponde ao total informado. Retorna `data`, `page`, `size`, `total_items`, `total_pages`, `has_more`, `complete`, `source`, `api_version`, `request_id`, `queried_at`, `upstream_requests`, `pagination_note` e `snapshot_guaranteed: false`. `complete` indica que a página atual é a última; não significa que todas as páginas foram baixadas.

A interface consulta os itens ao abrir os detalhes e ao navegar entre suas páginas. Quando faltam identificadores originais válidos, informa a ausência e não faz uma chamada de itens.

## Listagens nos detalhes de uma contratação

As quatro rotas `GET /api/contratacoes/{cnpj}/{ano}/{sequencial}/{recurso}` usam os mesmos identificadores e parâmetros `pagina` e `tamanhoPagina` dos itens. Ao abrir os detalhes, a interface inicia as primeiras páginas dessas listagens e dos itens em segundo plano, com até duas requisições simultâneas. Pede dez registros por página nas quatro listagens e 100 nos itens. Cada aba preserva seu próprio estado e permite repetir uma consulta que falhou. Trocar de aba não faz nova consulta; mudar sua página consulta novamente a fonte. Fechar os detalhes, abrir outra contratação ou trocar o tipo documental cancela chamadas ativas e pendentes.

O painel tem largura de até 888 pixels e começa na aba **Detalhes**, com 12 campos documentais. Seu contador indica os campos exibidos; os contadores das outras cinco abas indicam o total de registros informado pela fonte, independentemente da página atual. `…` indica carregamento; `—` indica falha ou identificação insuficiente. Zero é mostrado somente quando confirmado pela fonte. As abas podem ser percorridas por setas, Home e End; em telas menores, a barra permite rolagem horizontal. Os links externos ficam no cabeçalho junto ao botão de fechar.

| Recurso | Campos em `data` | Serviço externo, relativo a `PNCP_DETAIL_BASE_URL` |
| --- | --- | --- |
| `arquivos` | `titulo`, `tipo`, `data_publicacao`, `url` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` e `/arquivos/quantidade` |
| `atas` | `numero`, `numero_controle_pncp`, `data_assinatura`, `vigencia_inicio`, `vigencia_fim`, `data_cancelamento`, `url` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/atas` |
| `contratos` | `numero`, `numero_controle_pncp`, `data_assinatura`, `vigencia_inicio`, `vigencia_fim`, `fornecedor_nome`, `valor_global`, `url` | `/orgaos/{cnpj}/contratos/contratacao/{ano}/{sequencial}` |
| `historico` | `evento`, `nome`, `data_evento`, `justificativa` | `/orgaos/{cnpj}/compras/{ano}/{sequencial}/historico` e `/historico/quantidade` |

Todos os serviços de página recebem `pagina` e `tamanhoPagina`. Arquivos e histórico retornam listas; atas e contratos retornam um objeto com `data` e `totalRegistros`. HTTP 204 na listagem equivale a uma página sem registros; quantidade ausente, HTTP de erro, formato inesperado ou divergência entre página e total são reportados como erros. Nenhum HTTP 404 é convertido silenciosamente em lista vazia.

A resposta da aplicação contém `api_version`, `request_id`, `source`, `resource`, `data`, `page`, `size`, `total`, `total_pages`, `has_more`, `complete`, `snapshot_guaranteed: false`, `queried_at` e `upstream_requests`. `complete` identifica a última página. `valor_global` preserva os decimais como string. `url` é `null` quando o link de download é inválido ou os identificadores do registro não permitem gerar um link de acesso. O link de ata usa o ano da compra presente no número de controle PNCP, que pode diferir de `anoAta`.

O histórico apresenta o evento, o nome do documento quando fornecido, a data/hora e a justificativa. Uma justificativa ausente ou vazia é apresentada como `Exigência Legal`, seguindo o portal oficial. Textos são exibidos como texto; downloads aceitam apenas HTTP/HTTPS sem credenciais, e os links de atas e contratos apontam para o PNCP. Listagens não são consultadas durante pesquisa ou exportação. Quando faltam identificadores originais válidos, as seções mostram essa informação e não fazem requisições.

```sh
curl --fail-with-body -sS --get \
  http://localhost:8000/api/contratacoes/00000000000000/2026/1/arquivos \
  --data-urlencode 'pagina=1' --data-urlencode 'tamanhoPagina=10'
```

Esse identificador é sintético, para uso com `npm run demo`. A demonstração fornece arquivos, atas, contratos/empenhos e eventos fictícios, incluindo listas vazias, cancelamento, mais de uma página e valores monetários exatos. Seus links de documentos/registro são ilustrativos e não garantem a existência desses dados no PNCP.

## Exportação

`POST /api/export` recebe um objeto com o campo `query`, usando os mesmos critérios de pesquisa:

```sh
curl --fail-with-body -sS http://localhost:8000/api/export \
  -H 'Content-Type: application/json' \
  -d '{"query":{"api_version":"2.0","q":"firewall","status":"todos","pncp_filters":{"ufs":["DF"]}}}' \
  -o compras.csv
```

A coleta começa na página 1 e usa `PNCP_PAGE_SIZE`, independentemente de `page` e `size` enviados dentro de `query`. O total deve caber em `PNCP_MAX_EXPORT_DOCUMENTS`, cujo máximo é 10.000. A operação é recusada quando o total supera esse limite; ela não produz um recorte dos primeiros resultados.

Mudança de total, documento duplicado ou sem identidade, página incompleta e limites de bytes interrompem a operação. O servidor monta todo o CSV em memória antes de responder. Um erro retorna JSON, portanto clientes devem verificar o status HTTP antes de tratar o corpo salvo como CSV.

O CSV usa UTF-8 com BOM, vírgulas, quebras CRLF e todos os campos documentais na ordem de `columns_by_document[document_type]`. Em contratos, inclui tipo, fornecedor, CPF/CNPJ, valor global, assinatura, início/fim de vigência e nota fiscal. As células são delimitadas por aspas, e aspas internas são duplicadas. A exportação não inclui `_raw`, `_identity`, `_purchase` nem itens/resultados; mantém uma linha por documento.

Cabeçalhos da resposta: `Content-Disposition`, `X-PNCP-Started-At`, `X-PNCP-Finished-At`, `X-PNCP-Source-Total`, `X-Exported-Rows` e `X-Snapshot-Guaranteed: false`. A coleta é nova e pode diferir da tabela, mesmo quando conclui com sucesso.

## Saúde, erros e diagnóstico

`GET /api/health` retorna `status: "ok"`, `api_version`, `source`, `live`, `active_operations`, `last_pncp_call` e `now`. Não faz uma consulta ao PNCP. `last_pncp_call` é `null` antes da primeira chamada e no modo demonstração.

As respostas usam `Cache-Control: no-store` e `X-Request-ID`. Falhas seguem este formato:

```json
{
  "error": {
    "code": "INVALID_SIZE",
    "message": "size deve ser 10, 25, 50 ou 100.",
    "request_id": "identificador-da-operacao",
    "retryable": false,
    "details": {}
  }
}
```

| HTTP | Exemplos | Ação |
| --- | --- | --- |
| 400 | `UNKNOWN_FIELD`, `INVALID_DOMAIN`, `INVALID_SIZE` | Corrigir a requisição |
| 409 | `CAPABILITY_UNAVAILABLE`, `DOCUMENT_FILTER_UNAVAILABLE`, `DOMAIN_UNAVAILABLE`, `SOURCE_CHANGED` | Conferir o tipo documental e a capacidade ou repetir a consulta quando os dados mudarem |
| 413 | `BODY_TOO_LARGE` | Reduzir o corpo enviado |
| 422 | `PAGE_OUT_OF_RANGE`, `EXPORT_TOO_BROAD`, limites de recursos | Ajustar a página ou delimitar a pesquisa |
| 429 | `CONCURRENCY_LIMIT` | Aguardar e repetir; observar `Retry-After` |
| 502 | `INVALID_UPSTREAM`, `PNCP_HTTP_ERROR`, `UNSAFE_REDIRECT` | Inspecionar a resposta da fonte e os logs |
| 503/504 | `PNCP_UNAVAILABLE`, `PNCP_TRANSPORT_ERROR`, `PNCP_TIMEOUT`, `OPERATION_TIMEOUT` | Verificar conectividade e limites; repetir conforme o erro |
| 500 | `INTERNAL_ERROR` | Correlacionar `request_id` com o diagnóstico nos logs |

O servidor escreve eventos JSON `operation`, `upstream` e `operation_error` na saída padrão. Para limitações conhecidas e procedimentos de verificação, consulte [Testes e validação](validacao.md).
