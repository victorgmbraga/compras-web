# Viabilidade dos filtros pendentes do PNCP

Data: 6 de outubro de 2026.

## Situação da implementação

Estão implementados os quatorze filtros documentais `srp`, `codigo_ibge`, `tipos`, `normativos_base`, `amparos_legais`, `fontes_orcamentarias`, `fontes`, `modos_disputa`, `indicador_orcamento_sigiloso`, `tem_ata_registro_preco`, `tem_contrato_empenho`, `tem_nfe_contrato`, `exigencia_conteudo_nacional` e `possui_emenda_parlamentar`. Nos itens, estão liberados `criterios_julgamento`, `categorias_leilao`, `beneficios`, `incentivo_produtivo_basico`, `aplicabilidade_margem_preferencia_normal` e `aplicabilidade_margem_preferencia_adicional`. A configuração padrão possui **37 filtros habilitados**, **34 pendentes para edital**, **nove exclusivos de contratos** e sete argumentos reservados. Os testes exercitam a interface, a validação, a serialização, a consulta e o CSV; a demonstração aplica os grupos liberados e mantém dois itens por contratação.

Os domínios fechados são conferidos antes da busca e da exportação. A interface agrupa os campos por nível, apresenta rótulos e exemplos, distingue contratos indisponíveis e reconcilia os amparos quando os normativos mudam. A conferência mantém amparos compatíveis, remove os incompatíveis com aviso e bloqueia a aplicação se a verificação falhar.

A origem corresponde a `usuario_id`, distinta de fonte orçamentária. O modo de disputa corresponde a `modo_disputa_id`; os critérios são enviados ao PNCP junto da modalidade, sem deduzir restrições locais. Os booleanos preservam `false` na pesquisa, na exportação e ao reabrir os controles para edição. A demonstração inclui registros com `null`, que não são classificados como Sim ou Não. `tem_nfe_contrato` não habilita `possui_nfe`, exclusivo de contratos.

Os catálogos de países, portes e naturezas jurídicas estão conectados por `GET /api/pncp/filters?campo=...`, preservando IDs e estado ativo. Seus filtros continuam pendentes. A identidade de país aceita pela busca ainda não foi definida; não houve conversão automática para o código BCB nem flexibilização dessa validação. Municípios de fornecedores estão preparados para sugestões; margem de preferência possui seleção singular com validação de domínio. Esses controles também não significam liberação automática dos filtros.

### Evidência de SRP, IBGE e domínios documentais

As consultas abaixo usaram `q=firewall`, tipo `edital`, status `todos`, ordem `-data` e tamanho 10 no cliente HTTPS real. Foram comparados os campos de **todos os dez documentos de cada resposta válida**, em vez de concluir apenas pela variação dos totais:

| Filtro | Valores com resposta válida | Campo conferido nos registros |
| --- | --- | --- |
| `srp` | `true` e `false` | `srp` com o mesmo booleano |
| `codigo_ibge` | `5300108` | `codigo_ibge` com o mesmo código |
| `tipos` | `1`; lista `2\|3` | `tipo_id` pertencente à seleção |
| `normativos_base` | `1` | `normativo_base_id` contendo o ID |
| `amparos_legais` | `19` | `amparo_legal_id` contendo o ID |
| `fontes_orcamentarias` | `4` | `fonte_orcamentaria_id` contendo o ID |

Também houve acesso real aos três catálogos pela API da aplicação: 248 países, seis portes e 96 naturezas jurídicas na consulta efetuada. Nas verificações posteriores pela API, SRP retornou HTTP 200 com registros correspondentes, enquanto outras tentativas receberam erros de indisponibilidade ou timeout. Mesmo consultas mais restritas apresentaram falhas. Isso limita a confirmação de disponibilidade contínua e de todas as combinações de listas; não invalida as respostas correspondentes obtidas nas sondagens anteriores.

### Evidência de origem, disputa e condições documentais

As sondagens válidas conferiram **todos os dez registros de cada página**, exceto exigência de conteúdo nacional com `true`, cuja resposta continha um único registro. Elas usaram tipo `edital` e tamanho 10, com texto `firewall`, `software` ou sem texto, conforme indicado:

| Filtro | Valores conferidos | Campo correspondente | Contexto das respostas válidas |
| --- | --- | --- | --- |
| `fontes` | `3`; `3\|4`; `3\|5` | `usuario_id` | Único `3` com `software`, `todos`, `-data`; `3\|4` com `firewall`, `todos`, `-data`; `3\|5` com `firewall`, `propostas_encerradas`, `-data`, contendo registros das duas origens |
| `modos_disputa` | `1`; `5`; `1\|3` | `modo_disputa_id` | Único `1` com `software`, `todos`, `-data`; `5` e lista com `firewall`, `todos`, `data`; a lista retornou os dois modos |
| `indicador_orcamento_sigiloso` | `true` e `false` | Mesmo nome e booleano | `firewall`, `todos`, `-data` |
| `tem_ata_registro_preco` | `true` e `false` | Mesmo nome e booleano | `true` com `firewall`, `todos`, `-data`; `false` com `software`, `todos`, `data`, e também sem texto, `todos`, `-data` |
| `tem_contrato_empenho` | `true` e `false` | Mesmo nome e booleano | `true` com `software`, `todos`, `-data`; `false` com `firewall`, `todos`, `-data` |
| `tem_nfe_contrato` | `true` e `false` | Mesmo nome e booleano | `firewall`, `todos`, `-data` |
| `exigencia_conteudo_nacional` | `true` e `false` | Mesmo nome e booleano | `firewall`, `todos`, `-data`; controle positivo com um registro |

Foram observados registros com campos booleanos ausentes ou `null` nas buscas sem aquele filtro. Não houve conversão desses valores para `false`. Os ensaios confirmam as páginas e os valores acima, sem garantir todas as combinações, estabilidade da indexação ou disponibilidade contínua. Várias tentativas retornaram HTTP 503 ou timeout, incluindo sondagens de domínios; os domínios de origem e disputa já haviam sido observados no levantamento. Pela API real da aplicação, orçamento sigiloso `false`, ata vinculada `false` e modo de disputa `5` retornaram HTTP 200 com os dez registros correspondentes. O modo fez uma consulta de domínio e uma de busca. Sistema de origem `3` recebeu HTTP 503 nessa verificação pela aplicação, embora sua busca direta tenha sido conferida nas sondagens acima.

### Evidência de emenda parlamentar e filtros de itens

As consultas usaram `edital`, tamanho 10 e status `todos`, exceto onde indicado. Campos disponíveis no índice de busca foram conferidos em todos os registros da página; para categorias e benefícios, a conferência dependeu dos detalhes de contratações selecionadas, pois esses campos não aparecem na resposta documental.

| Filtro | Valores e contexto confirmados | Conferência |
| --- | --- | --- |
| `possui_emenda_parlamentar` | `true` sem texto, `-data`: dez registros; `false` sem texto, `-data`, órgão `33565`, unidade `2848840`, ano `2026`: cinco registros | Mesmo campo e booleano em todos os registros. Pela API da aplicação, a condição `false` e o CSV retornaram HTTP 200, com cinco contratações |
| `criterios_julgamento` | `1` com órgão `44611`, unidade `1021`, ano `2026`, sem texto, `data`; `7` e `1\|7` com `firewall`, `data` | Dez registros por página com IDs selecionados em `criterio_julgamento_id`. Dois controles do valor `1` tinham um item cada, ambos com `criterioJulgamentoId=1` |
| `categorias_leilao` | `1` sem texto, `-data`; `3` com `software`, `-data` | Duas contratações do valor `1`, com oito e um item, todos `itemCategoriaId=1`. Duas do valor `3`, com três e um item, todos `itemCategoriaId=3` |
| `beneficios` | `1` com `cpac-ram32gb-19000`, `-data`: sete registros; também com `firewall`, `recebendo_proposta`; `4` sem texto, `data`; `1\|4` com `firewall`, `relevancia` | Controle `00394452000103-1-021678/2026` com um item e `tipoBeneficio=1`. Dois controles do valor `4` tinham um e 35 itens, todos com `tipoBeneficio=4`. A lista recebeu uma busca válida; não houve inspeção de todos os seus itens |
| `incentivo_produtivo_basico` | `true` sem texto, `-data`, órgão `56281`, unidade `2427824`, ano `2025`: um registro; `false` com `software` ou com órgão `44611`, unidade `1021`, ano `2026` | Índice com o mesmo booleano. O controle positivo `06240352000109-1-000026/2025` possui três itens, dois com `false` e um com `incentivoProdutivoBasico=true` |
| `aplicabilidade_margem_preferencia_normal` | `true` com `software`, `-data`; `false` sem texto, `-data`, órgão `44611`, unidade `1021`, ano `2026` | Dez registros por página com o mesmo booleano. Controle positivo com um item `true`; outro com 124 itens teve `true` e `false` na primeira página de 100 itens |
| `aplicabilidade_margem_preferencia_adicional` | `true` sem texto, `data`, órgão `47563`, unidade `4212`, ano `2026`; `false` sem texto, `-data`, órgão `44611`, unidade `1021`, ano `2026` | Dez registros por página com o mesmo booleano. Dois controles positivos, com 93 e dois itens, apresentaram `aplicabilidadeMargemPreferenciaAdicional=true` e `false` |

Os domínios reais forneceram nove critérios, três categorias de leilão e cinco benefícios. A validação usa `item_categorias_leilao` e `item_beneficios`, mas serializa os nomes nativos `categorias_leilao` e `beneficios`. Benefício aplicável ao item e margem aplicável não equivalem aos indicadores de aplicação no resultado, que seguem pendentes.

As consultas e os detalhes são operações distintas, sem snapshot. A evidência confirma os controles acima, sem homologar todas as combinações nem a correlação de diferentes condições no mesmo item. Uma tentativa de verificar essa correlação com benefício e incentivo no mesmo controle recebeu HTTP 503; a aplicação não presume uma resposta para esse caso. A interface informa que os detalhes mantêm todos os itens. A tabela e o CSV mantêm uma linha por contratação, e a pesquisa não passa a consultar itens automaticamente.

Pela API da aplicação, critério `1`, benefício `1` e margem adicional `true` receberam HTTP 503 nessa rodada, apesar das respostas diretas válidas acima. Isso mantém a limitação de disponibilidade já observada. Adesão `true`, sem texto, teve uma resposta válida com zero registros; continua pendente por falta de controle positivo. Os próximos grupos incluem unidades de medida, intervalos de itens, resultados e fornecedores. Leia o [contrato atualizado](consultas-pncp.md) para os controles e formatos já implementados.

## Conclusão e escopo

É viável ampliar os filtros nativos sem restaurar consultas prontas ou refinamento local. Não há evidência suficiente para habilitar todos indiscriminadamente.

O levantamento inicial identificou 87 argumentos: 7 reservados, 17 filtros habilitados e **63 filtros pendentes**. A configuração local carregada com `--env-file-if-exists=.env` também apresentou 63 pendentes. Desses, **54 tinham contexto `edital`** e **9 eram exclusivos de `contrato`**, tipo documental ainda desabilitado. O estado vigente está na seção anterior.

Entre os 54 candidatos a edital há 34 escalares, 19 listas e uma enumeração singular. O transporte genérico já atende boa parte deles, mas configuração de habilitação não substitui validação de domínio e efeito remoto.

A análise de viabilidade não habilitou filtros; a implementação posterior liberou o grupo descrito acima. O contrato vigente está em [consultas-pncp.md](consultas-pncp.md).

## Método e alcance dos ensaios

- Inspeção de `src/schema.js`, `src/pncp-arguments.json`, `src/validation.js`, `src/pncp.js`, `src/query.js`, `src/server.js` e `public/app.js`.
- Chamadas reais pelo `PncpClient`, sem modo demo, sem retries e sem alterar arquivos de configuração. Nas rodadas paralelas, cada processo usou uma chamada por segundo; a rodada complementar usou duas por segundo.
- Consultas de sondagem: `document_type=edital`, `q=firewall`, `status=todos`, `order=-data`, primeira página e tamanho 10. Listas foram serializadas com pipe pelo cliente existente.
- Filtros ainda pendentes foram sondados diretamente pelo cliente, **não pela API da aplicação**, que corretamente continua rejeitando capacidades pendentes.
- A baseline obtida por uma das rodadas retornou 3.478 documentos. Outras tentativas de baseline falharam no transporte. Os totais abaixo são registros de momentos diferentes e não constituem comparação controlada nem snapshot.
- O primeiro ensaio de domínios pelo cliente retornou 28 chaves normalizadas. Houve sucesso nos três catálogos auxiliares. As tentativas de sugestões desta rodada falharam no transporte.
- As 34 capacidades escalares receberam 49 sondagens, incluindo `true` e `false` para os 15 booleanos; somadas às duas baselines, foram 51 chamadas, das quais 19 retornaram uma busca válida. Falhas remanescentes incluíram `PNCP_TRANSPORT_ERROR` e `PNCP_TIMEOUT`.
- Falha de transporte não significa parâmetro inválido ou endpoint inexistente. HTTP 200, zero resultados ou mudança de total, isoladamente, não certificam o predicado.

A ferramenta de fetch e uma tentativa com cURL falharam; o cliente Node da aplicação conseguiu respostas reais, embora de forma intermitente. Não há evidência para atribuir as falhas à API ou à rede local especificamente.

## Domínios efetivamente observados

O endpoint `/api/search/filters?tipos_documento=edital` forneceu, entre outros:

| Chave | Opções normalizadas | Exemplo de identidade |
| --- | ---: | --- |
| `fontes` | 291 | `3`: Compras.gov.br |
| `fontes_orcamentarias` | 6 | `2`: Municipal |
| `tipos` | 4 | `3`: Ato que autoriza a Contratação Direta |
| `normativos_base` | 20 | `1`: Lei 14.133/2021 |
| `amparos_legais` | 153 | `19`: Lei 14.133/2021, Art. 75, II |
| `modos_disputa` | 6 | `5`: Não se aplica |
| `criterios_julgamento` | 9 | `1`: Menor preço |
| `item_categorias_leilao` | 3 | `3`: Não se aplica |
| `item_beneficios` | 5 | `5`: Não se aplica |
| `resultado_item_situacoes` | 4 | `1`: Informado |
| `item_unidades_medida` | 499 | `UNIDADE` e `Unidade` são opções distintas |
| `orgaos_subrogados` | 361 | `5007`: SECRETARIA DE SAUDE |
| `unidades_subrogadas` | 1.229 | `24550`: [P]-HOSPITAL DA RESTAURAÇÃO |
| `fornecedores` | 15.000 | `40491`: CRISTALIA PRODUTOS QUIMICOS FARMACEUTICOS LTDA |
| `tipos_margens_preferencia` | 2 | `1`: Resolução CIIA-PAC; `2`: Resolução CICS |

Essas quantidades não garantem enumeração completa; o código trata os domínios extensos como parciais. Não vieram chaves para `municipios_fornecedor`, `paises_fornecedor`, `portes_fornecedor`, `naturezas_juridicas` ou `reservas_remanescentes` nessa resposta.

Os catálogos sob `/api/pncp/v1` responderam com arrays na raiz:

| Endpoint | Registros | Identidade observada |
| --- | ---: | --- |
| `/paises` | 248 | Aruba: `id="ABW"`, `codigoPaisBcb=655`; Brasil: `id="BRA"`, `codigoPaisBcb=1058` |
| `/portes-empresa` | 6 | ME: `id=1` |
| `/naturezas-juridicas` | 96 | Natureza Jurídica não informada: `id="0000"`, `statusAtivo=false` |

O código do Banco Central e o ID do catálogo de países não são equivalentes. O formato efetivamente exigido pelo filtro de busca precisa ser comprovado. `ABW` recebeu HTTP 200 com zero resultados; `BRA` falhou no transporte; `1058` recebeu HTTP 200 com zero resultados. Esses ensaios não resolvem qual identidade a busca espera.

## Matriz dos 54 candidatos a edital

### Escalares: 34

Todos têm entrada e serialização genéricas existentes. A coluna de sondagem informa apenas respostas recebidas, sem homologar a semântica. Onde consta "transporte", nenhuma resposta de busca válida foi obtida para aquele filtro nesta rodada.

| Filtro | Tipo | Sondagem real | Pendência principal |
| --- | --- | --- | --- |
| `codigo_ibge` | Texto, 7 dígitos | `5300108`: transporte | Confirmar filtro explícito de IBGE, distinto de `municipios` |
| `srp` | Booleano | `true`/`false`: transporte | Confirmar efeito e ausência de campo |
| `indicador_orcamento_sigiloso` | Booleano | `true`: 216; `false`: 3.259 | Confirmar correspondência com dados conhecidos |
| `tem_ata_registro_preco` | Booleano | `false`: 3.037; `true`: transporte | Confirmar vínculo e tratamento de ausência |
| `tem_contrato_empenho` | Booleano | `true`/`false`: transporte | Confirmar vínculo |
| `tem_nfe_contrato` | Booleano | `false`: 3.424; `true`: transporte | Confirmar vínculo, sem confundir com `possui_nfe` |
| `exigencia_conteudo_nacional` | Booleano | `true`: 1; `false`: transporte | Confirmar condição documental |
| `possui_emenda_parlamentar` | Booleano | `true`/`false`: transporte | Confirmar vínculo |
| `permite_adesao` | Booleano | `true`: 0; `false`: transporte | Obter controle positivo |
| `indicador_subcontratacao` | Booleano | `true`: 6; `false`: transporte | Confirmar condição no resultado do item |
| `data_homologacao_inicio` | Data | `2099-01-01`: transporte | Confirmar data do resultado, limites e fuso |
| `data_homologacao_fim` | Data | `1900-01-01`: timeout | Confirmar data do resultado, limites e fuso |
| `incentivo_produtivo_basico` | Booleano | `true`: 5; `false`: 3.465 | Confirmar condição do item |
| `aplicabilidade_margem_preferencia_normal` | Booleano | `true`/`false`: transporte | Confirmar condição do item |
| `aplicabilidade_margem_preferencia_adicional` | Booleano | `true`: 7; `false`: transporte | Confirmar condição do item |
| `item_quantidade_min` | Decimal | `1000000000000`: transporte | Confirmar quantidade e unidade do item |
| `item_quantidade_max` | Decimal | `0`: transporte | Confirmar quantidade e unidade do item |
| `item_valor_unitario_estimado_min` | Decimal | `1000000000000`: transporte | Confirmar valor do item |
| `item_valor_unitario_estimado_max` | Decimal | `0`: transporte | Confirmar valor do item |
| `item_valor_total_estimado_min` | Decimal | `1000000000000`: transporte | Confirmar valor do item |
| `item_valor_total_estimado_max` | Decimal | `0`: 57 | Confirmar valor do item e zeros/ausência |
| `ordem_classificacao_min` | Inteiro | `99999999`: transporte | Confirmar domínio; decidir se zero é válido |
| `ordem_classificacao_max` | Inteiro | `1`: 1.748 | Confirmar classificação do resultado |
| `indicador_aplicacao_margem_preferencia` | Booleano | `true`: 0; `false`: 3.475 | Obter controle positivo de resultado |
| `indicador_aplicacao_beneficio_me_epp` | Booleano | `true`: 160; `false`: transporte | Confirmar benefício aplicado no resultado |
| `indicador_aplicacao_criterio_desempate` | Booleano | `true`: 42; `false`: transporte | Confirmar condição do resultado |
| `resultado_quantidade_homologado_min` | Decimal | `1000000000000`: transporte | Confirmar quantidade do resultado |
| `resultado_quantidade_homologado_max` | Decimal | `0`: transporte | Confirmar quantidade do resultado |
| `resultado_valor_unitario_homologado_min` | Decimal | `1000000000000`: transporte | Confirmar valor do resultado |
| `resultado_valor_unitario_homologado_max` | Decimal | `0`: 66 | Confirmar valor do resultado e zeros/ausência |
| `resultado_valor_total_homologado_min` | Decimal | `1000000000000`: transporte | Confirmar valor do resultado |
| `resultado_valor_total_homologado_max` | Decimal | `0`: 65 | Confirmar valor do resultado e zeros/ausência |
| `resultado_percentual_desconto_min` | Decimal | `1000000000000`: transporte | Confirmar escala e limites do percentual |
| `resultado_percentual_desconto_max` | Decimal | `0`: 1.946 | Confirmar escala, zeros e ausência |

Valores muito altos e datas extremas foram sondagens de formato/limite, não exemplos recomendados para o usuário. Intervalos já têm validação de ordem no backend; isso não comprova inclusividade ou correlação dos registros filhos na API.

### Listas e enumeração: 20

As listas recebem strings e são enviadas por pipe. A enumeração de margem de preferência deve permanecer singular.

| Filtro | Origem de opções | Sondagem real | Trabalho necessário |
| --- | --- | --- | --- |
| `fontes` | `/filters` | `3`: transporte | Confirmar efeito e validar domínio |
| `fontes_orcamentarias` | `/filters` | `2`: transporte | Confirmar efeito e validar domínio |
| `tipos` | `/filters` | `3`: transporte | Confirmar efeito; checagem de domínio já existe |
| `normativos_base` | `/filters` | `1`: 3.441 | Confirmar efeito e dependência de amparos |
| `amparos_legais` | `/filters`, condicionado por normativos | `19`: 943 | Reconciliar seleção quando mudar normativo |
| `modos_disputa` | `/filters` | `5`: transporte | Confirmar efeito e compatibilidade de modalidade |
| `criterios_julgamento` | `/filters` | `1`: transporte | Confirmar condição do item e validar domínio |
| `categorias_leilao` | `item_categorias_leilao` | `1`/`3`: transporte | Confirmar aplicabilidade e alias existente |
| `beneficios` | `item_beneficios` | `5`: 1.383 | Confirmar benefício do item, não benefício aplicado |
| `situacoes_resultado` | `resultado_item_situacoes` | `1`: 2.170 | Confirmar resultado e alias existente |
| `reservas_remanescentes` | Domínio não presente na resposta observada | `1`: transporte | Identificar provedor e validar enumeração |
| `orgaos_subrogados` | `/filters` parcial e sugestões | `5007`: transporte; sugestões: transporte | Confirmar `/suggest` e IDs |
| `unidades_subrogadas` | `/filters` parcial e sugestões | `24550`: 0; sugestões: transporte | Obter controle positivo e confirmar sugestões |
| `fornecedores` | `/filters` parcial e sugestões | `40491`: transporte; sugestões: transporte | Confirmar fornecedor do resultado e sugestões |
| `unidades_medida` | `item_unidades_medida` parcial e sugestões | `UNIDADE`: transporte; sugestões: transporte | Preservar texto, caixa e espaços; confirmar campo de sugestão |
| `municipios_fornecedor` | Sugestões previstas no catálogo | Sugestões: transporte; busca não executada | Incluir no encaminhamento de domínios parciais; confirmar IDs |
| `paises_fornecedor` | `/api/pncp/v1/paises` | `ABW`: 0; `BRA`: transporte; `1058`: 0 | Integrar catálogo e resolver identidade exigida pela busca |
| `portes_fornecedor` | `/api/pncp/v1/portes-empresa` | `1`: 965 | Integrar catálogo e confirmar predicado |
| `naturezas_juridicas` | `/api/pncp/v1/naturezas-juridicas` | `0000`: 258 | Integrar catálogo, preservar zeros e distinguir opções inativas |
| `tipos_margens_preferencia` | `/filters`, duas opções | `1`: transporte | Controle de seleção única e validação do domínio, não texto livre |

As cinco tentativas de `/suggest` usaram os campos acima, tamanho 20 e textos como `Ministério`, `unidade`, `tecnologia` e `São Paulo`. Todas falharam no transporte; nenhuma forneceu uma resposta vazia que pudesse provar falta de suporte.

## Nove filtros fora do escopo de edital

| Filtro | Contexto do catálogo | Motivo para não habilitar agora |
| --- | --- | --- |
| `tipos_contrato` | Contrato | Espécie de contrato, não instrumento convocatório |
| `possui_nfe` | Contrato | Condição de contrato, distinta de `tem_nfe_contrato` |
| `fornecedores_subcontratados` | Contrato | Fornecedor subcontratado do contrato |
| `data_inicio_vigencia_inicio` | Contrato | Início de vigência do contrato |
| `data_inicio_vigencia_fim` | Contrato | Limite sobre início de vigência, não publicação |
| `data_assinatura_inicio` | Contrato | Data de assinatura do contrato |
| `data_assinatura_fim` | Contrato | Data de assinatura do contrato |
| `valor_global_min` | Contrato | Valor global, não estimativa da contratação |
| `valor_global_max` | Contrato | Valor global, não estimativa da contratação |

Adicionar esses nomes a `PNCP_VALIDATED_FILTERS` não os habilita para edital: o schema também exige compatibilidade documental. Implementá-los implica habilitar consultas de contratos, com projeção, validação, status, interface e testes próprios. Isso é expansão de escopo e não deve ocorrer implicitamente.

## Lacunas identificadas e andamento

1. **Estado de capacidade:** implementada a distinção entre `pending_validation` e `unsupported_document`, também apresentada na UI.
2. **Municípios de fornecedores:** incluídos em `partial_domains` e no encaminhamento de sugestões; o predicado continua pendente.
3. **Catálogos auxiliares:** conectados à API de domínios e aos controles da UI, com filtros ainda pendentes por padrão.
4. **Países:** a validação genérica de listas exige dígitos para `paises_fornecedor`, enquanto o catálogo oferece IDs como `BRA`. Antes de alterar essa regra, é preciso confirmar se a busca espera o ID ou o código BCB; não há justificativa para trocar um pelo outro por suposição.
5. **Margem de preferência:** implementada como `enum` singular, com controle de seleção e conferência do domínio; a comprovação do predicado segue pendente.
6. **Normalização:** catálogos auxiliares têm normalizador próprio para arrays com `id`, `nome` e `statusAtivo`, preservando zeros e códigos textuais. Outras estruturas ainda precisam de adaptação comprovada.
7. **Dependência legal:** implementada a reconciliação, com cancelamento de respostas anteriores, preservação de escolhas compatíveis e recuperação após falha.
8. **Validação de domínio:** o serviço usa metadados para conferir domínios fechados da busca e catálogos auxiliares; não considera listas parciais exaustivas.
9. **Usabilidade:** implementados grupos, rótulos, descrições, exemplos de entrada e cardinalidade dos controles.
10. **Demo:** implementada a semântica dos quatorze filtros documentais e seis filtros de itens liberados, catálogos e dependência legal. Cada contratação tem dois itens; os detalhes não são filtrados pelos critérios da pesquisa. A simulação de outros filtros continua parcial; os ensaios reais usam a fonte HTTPS.
11. **Condições documentais e itens:** liberados os grupos nas tabelas de evidências acima. Adesão, unidades de medida, intervalos de itens, resultados e fornecedores ainda precisam dos controles descritos neste plano.

## Critério de habilitação e plano recomendado

### 1. Corrigir o catálogo e os controles sem mudar a arquitetura

Separar os nove exclusivos de contrato, integrar os catálogos comprovados, ajustar seleção singular da margem, encaminhar municípios de fornecedores para sugestões e reconciliar amparos legais. Manter filtros não comprovados desabilitados.

### 2. Validar progressivamente filtros documentais e domínios

SRP, IBGE, fontes, instrumentos convocatórios, normativos/amparos, modos de disputa e seis condições booleanas documentais estão implementados. Para os candidatos restantes, obter casos conhecidos positivos e negativos, valores únicos/múltiplos e booleanos omitido/true/false. Normalizar e conferir domínios conforme suas respostas reais.

### 3. Validar filtros de itens e resultados

Exigir evidência sobre correspondência no mesmo item/resultado, existência de registros filhos, campos ausentes, unidade de quantidade, datas e escala de percentual. Uma contratação pode conter itens diferentes que satisfaçam condições separadamente: não prometer correlação sem ensaio.

Critérios, categorias, benefícios, incentivo e aplicabilidade de margens estão liberados com controles individuais. A correlação de combinações no mesmo item não está homologada. Unidades de medida, intervalos de itens e todos os filtros adicionais de resultados e fornecedores continuam pendentes.

A tabela e o CSV continuam representando contratações. Os itens dos detalhes não são automaticamente filtrados para conter apenas os registros filhos correspondentes.

### 4. Liberar somente subconjuntos comprovados

Para cada filtro, demonstrar a cadeia **controle de UI → valor correto → validação → serialização → efeito remoto**. Registrar exemplos e regressões sintéticas, além da evidência de integração real. `PNCP_VALIDATED_FILTERS` serve para declarar uma validação já feita, não para realizar essa validação.

Não acrescentar banco, cache de resultados, presets, refinamento local ou consulta automática de itens durante a pesquisa. A arquitetura de consultas nativas permanece válida para essa ampliação.

## Verificação

O levantamento usou leituras, inventário programático e sondagens reais. A implementação inclui testes de controles, domínios, catálogo, rejeição de valores inválidos, dependência legal, cancelamento e exportação. Listas de itens possuem testes de seleção múltipla e aliases; os booleanos têm cobertura de ausência, `true`, `false`, edição, remoção, combinações, paginação e CSV. Os testes preservam itens não correspondentes nos detalhes e verificam que a pesquisa e o CSV não fazem chamadas automáticas de itens. As respostas reais de busca não são persistidas como dados da aplicação. A cobertura e os resultados atuais estão em [Testes e validação](validacao.md).
