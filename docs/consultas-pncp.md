# Consultas diretas ao PNCP

Atualização: 6 de outubro de 2026.

A aplicação executa apenas pesquisas remotas de contratações. Cada consulta e troca de página chama `https://pncp.gov.br/api/search/`, preservando os documentos e sua ordem. Não há coleta de candidatos para aplicar regras locais nem consulta automática de itens para filtrar contratações.

## Contrato

`POST /api/query` aceita `api_version`, `document_type`, `q`, `status`, `pncp_filters`, `order`, `page` e `size`. Os controles são serializados para `tipos_documento`, `q`, `status`, `ordenacao`, `pagina` e `tam_pagina`; os filtros são enviados pelos nomes nativos. Listas são unidas por pipe e codificadas uma vez. Texto, datas, IDs, intervalos e capacidades são validados antes da pesquisa.

A interface usa `size=100`. A API aceita 10, 25, 50 ou 100. O total informado pelo PNCP aparece em `total` e `source_total`; `accessible_total` e `last_row` respeitam a janela de 10.000 documentos. A tabela não elimina documentos por objeto, categoria ou ausência de identificação dos itens.

Filtros de situação e tipo de item permanecem disponíveis como argumentos nativos: `situacoes_item` recebe IDs e `tipos_item` recebe `S` ou `M`. Seu envio e efeito na busca foram ensaiados em 5 de outubro de 2026; a evidência anterior permanece no documento histórico [otimizacao-consultas-prontas.md](otimizacao-consultas-prontas.md). A aplicação já não combina esses filtros com verificações de presets.

Os parâmetros `mode`, `preset`, `filters`, `header_filters`, `filter_join`, `deduplicate` e `sorters` foram removidos e geram `UNKNOWN_FIELD`.

## Itens e exportação

Os detalhes consultam os endpoints de quantidade e página de itens do PNCP apenas ao abrir a contratação ou paginar seus itens. Quantidade, situação, valores e identificadores são preservados. A última página é determinada pelo total de itens.

`POST /api/export` recebe apenas `{query}`. A coleta percorre todas as páginas remotas, em ordem, até o limite `PNCP_MAX_EXPORT_DOCUMENTS` (máximo de 10.000). `PNCP_PAGE_SIZE` controla o tamanho de cada chamada da exportação. Mudança de total, duplicatas, ausência de identidade ou página incompleta interrompem a operação; não é produzido CSV parcial. Essa conferência de consistência não filtra nem agrupa documentos.

Não existe garantia de snapshot. A exportação usa dados novos e pode diferir da tabela. O modo de demonstração é uma fonte sintética explícita para desenvolvimento e testes, sem fallback na produção.
