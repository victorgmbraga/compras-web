# Contrato da API e consultas ao PNCP

A API da aplicação usa a versão `2.0` e habilita o tipo documental `edital` (contratações). O servidor consulta `https://pncp.gov.br/api/search/` para pesquisas e `https://pncp.gov.br/api/pncp/v1` para itens. Os endereços são configuráveis conforme o [guia de configuração](configuracao.md).

## Pesquisa

`POST /api/query` recebe um objeto JSON com `Content-Type: application/json`. O corpo tem limite de 256 KiB, e campos desconhecidos são rejeitados.

| Campo | Padrão | Valores aceitos |
| --- | --- | --- |
| `api_version` | `"2.0"` | `"2.0"` |
| `document_type` | `"edital"` | `"edital"` |
| `q` | `""` | Texto de até 128 caracteres |
| `status` | `"todos"` | `"todos"`, `"recebendo_proposta"`, `"propostas_encerradas"` |
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
| `tipos` | Lista de IDs de instrumentos convocatórios conferidos no domínio do PNCP |
| `fontes_orcamentarias` | Lista de IDs conferidos no domínio do PNCP |
| `normativos_base`, `amparos_legais` | Listas de IDs; os amparos são conferidos no domínio condicionado pelos normativos selecionados |
| `esferas` | Lista com `F`, `E`, `M`, `D` ou `N` |
| `poderes` | Lista com `E`, `L`, `J` ou `N` |
| `modalidades`, `situacoes` | Listas de IDs como strings, conferidos no domínio do PNCP |
| `situacoes_item` | Lista de IDs como strings, conferidos em `item_situacoes` |
| `tipos_item` | String única: `"S"` (serviço) ou `"M"` (material) |
| `anos` | Lista de anos no formato `AAAA`, como `["2026"]` |
| `data_publicacao_inicio`, `data_publicacao_fim` | Datas reais no formato `AAAA-MM-DD` |
| `valor_total_estimado_min`, `valor_total_estimado_max` | Decimais não negativos como strings com ponto, por exemplo `"1000.50"` |
| `valor_total_homologado_min`, `valor_total_homologado_max` | Mesmo formato decimal |

As listas devem conter de 1 a 100 strings; não envie nomes de órgãos no lugar dos IDs nem caracteres `|` dentro dos valores. Os intervalos devem ter início ou mínimo menor ou igual ao fim ou máximo. `status` representa o período de recebimento de propostas; `situacoes` é um filtro separado de situação da contratação.

`GET /api/schema` informa `columns`, `capabilities`, `statuses`, `orders` e `limits`. O catálogo em [`src/pncp-arguments.json`](../src/pncp-arguments.json) contém 87 argumentos: sete reservados, 23 filtros habilitados, 48 pendentes de validação para contratações e nove exclusivos de contratos (`unsupported_document`). Um argumento catalogado não implica suporte ativo: confira `state`, `reserved`, `documents`, `type` e `domain`.

Cada capacidade também informa `label`, `group`, `input_hint`, `cardinality`, `domain_source` e `domain_kind`. O tipo `enum` é singular: `tipos_item` e `tipos_margens_preferencia` usam uma string escolhida no domínio, não uma lista nem texto livre. O segundo continua pendente por padrão. Para habilitar filtros adicionais após verificar seu efeito real, consulte [PNCP_VALIDATED_FILTERS](configuracao.md#habilitar-filtros-adicionais).

### Resposta da pesquisa

| Campo | Significado |
| --- | --- |
| `data` | Documentos da página, na ordem retornada pelo PNCP |
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

`GET /api/pncp/filters` aceita `tipos_documento=edital`, `normativos_base` com IDs separados por pipe e `campo` com o nome de um filtro que possui domínio. Campos desconhecidos ou exclusivos de contratos são rejeitados. Retorna `filters`, `warnings`, `raw`, `partial_domains`, `request_id` e `queried_at`. As opções são normalizadas para `{id, label}`. Opções de ano fora de `AAAA` são omitidas da lista normalizada com aviso; a resposta original fica em `raw`.

Sem `campo`, ou com um filtro da busca, a origem é `/api/search/filters`. Para os campos abaixo, apenas o catálogo solicitado é consultado:

| `campo` | Endpoint PNCP | Identidade preservada |
| --- | --- | --- |
| `paises_fornecedor` | `/api/pncp/v1/paises` | ID textual, como `BRA`; não é convertido para `codigoPaisBcb` |
| `portes_fornecedor` | `/api/pncp/v1/portes-empresa` | ID como string |
| `naturezas_juridicas` | `/api/pncp/v1/naturezas-juridicas` | ID com zeros à esquerda, como `0000` |

Opções desses catálogos podem incluir `active: false`; a interface distingue opções inativas sem descartar registros históricos. Conectar o catálogo não habilita o filtro: os três campos continuam pendentes de validação do predicado. Para países, a identidade aceita pela busca ainda precisa ser comprovada; a validação de listas de IDs numéricos não foi relaxada para presumir que o ID alfabético é aceito.

Domínios fechados são conferidos pelo backend antes da pesquisa e da exportação, incluindo os filtros ativados por `PNCP_VALIDATED_FILTERS`. Domínios parciais utilizam sugestões e não são tratados como listas exaustivas. `municipios_fornecedor` está preparado para esse encaminhamento, mas permanece pendente por padrão.

Ao adicionar ou remover normativos, a interface consulta novamente os amparos, preserva os válidos e remove os incompatíveis com aviso. Enquanto essa conferência está em andamento, **Aplicar e pesquisar** fica desabilitado. Em caso de falha, remova o filtro de amparo ou adicione novamente o normativo para repetir a conferência.

`GET /api/pncp/suggest` recebe:

| Parâmetro | Regra |
| --- | --- |
| `tipos_documento` | `edital`, também usado quando omitido |
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

O CSV usa UTF-8 com BOM, vírgulas, quebras CRLF e todos os campos documentais na ordem de `columns` do esquema. As células são delimitadas por aspas, e aspas internas são duplicadas. A exportação não inclui `_raw`, `_identity`, `_purchase` nem os itens de cada contratação.

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
| 409 | `CAPABILITY_PENDING`, `DOCUMENT_FILTER_UNAVAILABLE`, `DOMAIN_UNAVAILABLE`, `SOURCE_CHANGED` | Conferir o tipo documental e a capacidade ou repetir a consulta quando os dados mudarem |
| 413 | `BODY_TOO_LARGE` | Reduzir o corpo enviado |
| 422 | `PAGE_OUT_OF_RANGE`, `EXPORT_TOO_BROAD`, limites de recursos | Ajustar a página ou delimitar a pesquisa |
| 429 | `CONCURRENCY_LIMIT` | Aguardar e repetir; observar `Retry-After` |
| 502 | `INVALID_UPSTREAM`, `PNCP_HTTP_ERROR`, `UNSAFE_REDIRECT` | Inspecionar a resposta da fonte e os logs |
| 503/504 | `PNCP_UNAVAILABLE`, `PNCP_TRANSPORT_ERROR`, `PNCP_TIMEOUT`, `OPERATION_TIMEOUT` | Verificar conectividade e limites; repetir conforme o erro |
| 500 | `INTERNAL_ERROR` | Correlacionar `request_id` com o diagnóstico nos logs |

O servidor escreve eventos JSON `operation`, `upstream` e `operation_error` na saída padrão. Para limitações conhecidas e procedimentos de verificação, consulte [Testes e validação](validacao.md).
