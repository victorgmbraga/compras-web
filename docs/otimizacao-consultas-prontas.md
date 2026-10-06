> Referência histórica. Desde 06/10/2026, a aplicação usa somente consultas diretas ao PNCP; consultas prontas e refinamento local foram removidos. O comportamento atual está em [consultas-pncp.md](consultas-pncp.md).

# Otimização das consultas prontas

Data: 05/10/2026.

Todas as nove consultas especializadas enviam as restrições candidatas ao PNCP antes de coletar documentos e consultar seus itens:

| Consultas | Filtros automáticos |
| --- | --- |
| Oracle, Microsoft, Adobe, Symantec / Broadcom, Antivírus e proteção, Graebert / CAD, MongoDB | `situacoes=1`, `tipos_item=S`, `situacoes_item=1|2` |
| Desenvolvimento, Infraestrutura | Os mesmos filtros, mais `esferas=F` e `modalidades=6` |

Todas as contratações e Pesquisa personalizada mantêm os filtros definidos pelo usuário. Os presets por catálogo continuam exigindo `PNCP_PRESET_CATALOG_ID`.

A configuração padrão e `.env.example` habilitam `PNCP_VALIDATED_PRESET_OPTIMIZATIONS=situacoes,tipos_item,situacoes_item,esferas,modalidades`. A `.env` local foi atualizada com essa lista. Instalações que definam explicitamente a variável como vazia desativam a otimização. Tipo e situação do item estão disponíveis no formulário de filtros; as situações são conferidas no domínio retornado pelo PNCP durante cada operação.

Filtros do usuário são mantidos e intersectados com as condições obrigatórias. Por exemplo, selecionar apenas itens homologados conserva `situacoes_item=2`. Selecionar somente material em uma consulta especializada produz `PRESET_FILTER_CONFLICT`.

## Verificação da API e alcance

Foram feitas chamadas ao endpoint oficial `https://pncp.gov.br/api/search/`. Durante os ensaios, `q=microsoft` retornou 8.557 candidatos, `situacoes=1` reduziu o total para 8.257 e a combinação `situacoes=1&tipos_item=S&situacoes_item=1%7C2` retornou 2.591. Em uma chamada posterior, serviço mais contratação divulgada retornou 2.785 candidatos e os três filtros retornaram 2.592. Os totais podem mudar durante a publicação de documentos.

O endpoint oficial `/api/search/filters?tipos_documento=edital` também foi consultado: confirmou `item_tipos` com `S=Serviço`, `M=Material`, `item_situacoes` com `1=Em andamento`, `2=Homologado` e `situacoes` com `1=Divulgada no PNCP`. Houve falhas transitórias de conexão durante os ensaios, mas uma nova tentativa retornou os domínios completos.

Esses ensaios demonstram redução dos candidatos, sem certificar que o índice remoto correlacione tipo e situação no mesmo item. Por isso a aplicação continua verificando o objeto e a situação da contratação e consultando os itens para confirmar um mesmo serviço em andamento ou homologado. As restrições de esfera e modalidade seguem a referência do projeto.

Expressões experimentais com OR, curingas e todos os termos de Microsoft e Antivírus retornaram zero mesmo quando buscas menores tinham resultados. Elas não foram ativadas como tradução automática dos padrões. O texto informado pelo usuário continua sendo enviado como `q`, sem ser substituído pelo nome do preset.

O limite de refinamento permanece aplicado ao total de candidatos depois dos filtros nativos. Resultados ainda muito amplos exigem texto, período, UF ou órgão. Os filtros aplicados aparecem em `effective_filters` nas respostas de consulta e exportação.
