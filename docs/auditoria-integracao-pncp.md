> Referência histórica. Desde 06/10/2026, a aplicação usa somente consultas diretas ao PNCP; consultas prontas e refinamento local foram removidos. O comportamento atual está em [consultas-pncp.md](consultas-pncp.md).

# Auditoria de integração — Compras Web 2.0.1

Data: 02/10/2026. Backend Node.js, frontend Tabulator 6.3.1. Contrato da API do aplicativo mantido em 2.0.

A revisão encontrou falhas no contrato de domínios e itens, nos links, na paginação da interface e na recuperação após erros. As correções estão no pacote atualizado. A tabela continua ocupando quase toda a tela.

## Problemas corrigidos

| Área | Problema encontrado | Correção |
| --- | --- | --- |
| Links do PNCP | A busca real retorna `/compras/{cnpj}/{ano}/{sequencial}`, mas o adaptador abria o portal geral. | Reconhece `/compras/` e `/app/compras/`, preserva `/app` e valida origem e caminho. A correção alcança detalhes e CSV. |
| Domínio de anos | `/filters` retorna `{ano: "2026", total: ...}`, sem `id`. A lista ficava vazia. | Normaliza `ano` para o ID textual da opção, sem alterar o parâmetro enviado ao PNCP. |
| Anos incompatíveis | A resposta oficial também continha anos com cinco ou mais dígitos, rejeitados pelo próprio contrato local. | Exibe apenas opções no formato AAAA, informa a quantidade omitida e preserva todas as opções no registro original. Foram observadas 23 opções incompatíveis. |
| Situação dos itens | A API real usa `situacaoCompraItem`; a implementação consultava apenas `situacaoCompraItemId`, fazendo serviços verificáveis parecerem indeterminados. | Aceita o campo real e o alias do manual. Se ambos vierem com valores conflitantes, retorna erro explícito. Mantém a exigência de serviço e situação no mesmo item. |
| Dados insuficientes | Um candidato sem CNPJ, ano ou sequencial original abortava todo o refinamento ao tentar carregar itens. | Contabiliza o candidato como não verificável, sem inventar uma identificação. Exportação completa continua exigindo cobertura; somente confirmados exige escolha explícita. |
| Ordenação de datas | A conversão para milissegundos perdia frações mais precisas; comparações textuais também distinguiam representações do mesmo horário. | Compara segundos e fração decimal separadamente, preservando nanossegundos e ordenação estável de horários equivalentes. Continua recusando misturar datas com e sem fuso. |
| Atualização da tabela | `setData` fazia o Tabulator voltar à página 1, apesar do parâmetro de página fornecido. | Usa a paginação do Tabulator para atualizar a página atual e restaura o tamanho da última consulta concluída quando necessário. |
| Autocomplete | Uma nova busca ou falha deixava sugestões da consulta anterior disponíveis para seleção. | Remove as opções antigas durante a busca e após falha; conserva apenas seleções explícitas. Nova tentativa limpa a mensagem anterior. |
| Paginação dos detalhes | Uma falha desabilitava a próxima página sem permitir repetir a navegação. Atualizar itens também voltava à primeira página. | Recupera os controles da última página válida e atualiza a página atual. Uma página vazia confirma o fim. |
| Concorrência do CSV | A finalização de uma exportação cancelada podia alterar controles de outra exportação. | A atualização dos controles respeita o identificador da operação. Reabrir o diálogo recupera o botão de geração. |
| Diagnóstico entre módulos | Resposta HTTP, logs do servidor e chamadas PNCP usavam IDs diferentes. | Compartilha um `request_id` e o apresenta no header `X-Request-ID`, permitindo correlacionar sucesso, erros e chamadas externas. |
| Requisição malformada | Uma URL inválida era analisada fora do tratamento de erros do servidor. | Retorna HTTP 400 / `INVALID_URL`; o processo continua atendendo outras requisições. |
| Distribuição | O build não incluía o Dockerfile mencionado no README. | A distribuição passa a incluir o Dockerfile. |

Os domínios dependentes de `normativos_base` agora recebem esse contexto da seleção atual. Aliases de domínios extensos são reconhecidos pela interface. A demonstração foi ajustada para usar os formatos reais de ano e situação de item.

A correção anterior de `document_type` permanece: `doc_type="_doc"` é metadado do índice, e o tipo funcional é `document_type="edital"`. As validações de tipo, tamanho, JSON, cobertura e limites continuam ativas.

## Verificação automatizada

**54 testes passaram, sem falhas.** Dez regressões novas reproduzem anos, links, situações, identificações ausentes, datas, erros de detalhes, URLs inválidas e correlação dos logs. A suíte também verifica coleta completa, mudanças da fonte, cancelamento, regras, precisão monetária, exportação e rotas HTTP.

```sh
npm ci
npm test
npm run build
```

Os resultados estão em `test-results.txt`. O script opcional de UI também foi ampliado para conferir atualização na segunda página e anos; sua execução completa depende de Playwright e Chromium disponíveis.

## Respostas reais e alcance da validação

Foram obtidos corpos HTTP 200 do PNCP por cURL. Esses corpos originais, sem modificar os dados, foram processados em **11 verificações pela API HTTP local**, envolvendo o servidor, adaptador, serviço de consulta, worker e CSV.

| Ensaio | Resultado |
| --- | --- |
| Busca `q=firewall`, `orgaos=39017`, página 1, tamanho 10 | Conjunto oficial completo: 2 documentos; ambos do órgão selecionado. |
| Busca `q=firewall`, página 1, tamanho 50 | 50 documentos, total informado de 3467. Valida esta página, sem alegar coleta das demais. |
| Domínios de editais | 28 domínios. Dos 61 anos recebidos, 38 atendem ao formato AAAA; 23 foram omitidos com aviso. |
| Sugestões de órgãos com `q=saude` | 10 opções; IDs preservados como texto. |
| Refinamento por objeto contendo `firewall` | 2 candidatos, 1 correspondência. A busca textual do PNCP também alcança outros campos indexados. |
| CSV nativo | 2 linhas, 23 colunas, UTF-8 com BOM, 1918 bytes; nova chamada de coleta. |
| CSV refinado | 1 linha, com os mesmos critérios do refinamento. |
| Itens da contratação `76208867000107/2026/534` | 31 itens na primeira página; segunda página vazia. |
| Itens da contratação `76208867000107/2026/449` | 7 serviços com `situacaoCompraItem=1`; segunda página vazia. O predicado de serviço/situação confirmou os sete itens. Isso não equivale a confirmar um preset de marca para esse documento. |

O resumo verificável, com método e parâmetros, está em `auditoria-respostas-reais.json`. Essas verificações usam **reprodução local de respostas capturadas**, não uma conexão direta Node.js → PNCP bem-sucedida. O sistema de produção mantém o cliente HTTPS normal e consulta novamente a fonte a cada operação; não recebeu cache nem transporte alternativo por cURL.

Neste ambiente, a conexão direta do cliente Node.js apresentou timeout; ensaios anteriores também retornaram HTTP 502. Algumas chamadas de teste receberam JSON truncado, corretamente rejeitado. Não há evidência suficiente para atribuir essas falhas ao PNCP em vez do caminho de rede deste ambiente.

## Conferência da interface

No navegador, com dados explicitamente sintéticos e falhas controladas, foram conferidos:

- Paginação 1–50 / 51–64 e atualização mantendo a página 2.
- Seleção de ano e aplicação de órgão por ID.
- Falha do autocomplete sem opções antigas; nova busca recupera as sugestões.
- Itens sob demanda, falha da próxima página, repetição e fim por página vazia.
- Preset Oracle: 64 candidatos, 6 confirmados, nenhum não verificável.
- Cancelamento e reabertura do diálogo de CSV; confirmação de geração de 6 linhas.

O conteúdo e os headers dos CSVs foram verificados pela API HTTP. O evento de download do navegador de teste expirou, portanto não foi usado como evidência da gravação do arquivo no disco.

Captura: `interface-compras-web-auditoria.jpg`, com a segunda página após atualizar. A configuração e o servidor temporário de testes foram removidos antes do empacotamento.

## Pendências e atualização

A revisão não certifica individualmente todos os 87 argumentos do registro. Os filtros adicionais continuam pendentes até ensaio do efeito e do domínio na fonte. Desenvolvimento e Infraestrutura continuam exigindo um catálogo oficialmente verificado em `PNCP_PRESET_CATALOG_ID`. Não foram habilitados por suposição.

Para atualizar a instalação, substitua os arquivos de código e **preserve sua `.env` atual**. Execute `npm ci`, `npm test` e `npm start`. Não é necessária migração de banco de dados. Os endpoints de busca e detalhes e o contrato 2.0 do aplicativo foram mantidos.

## Fontes primárias

- [Domínios de editais do PNCP](https://pncp.gov.br/api/search/filters?tipos_documento=edital).
- [Sugestões de órgãos do PNCP](https://pncp.gov.br/api/search/suggest?tipos_documento=edital&campo=orgaos&q=saude&tam_pagina=10).
- [Consulta delimitada usada no ensaio](https://pncp.gov.br/api/search/?tipos_documento=edital&status=todos&ordenacao=-data&pagina=1&tam_pagina=10&q=firewall&orgaos=39017).
- [Consultar itens — manual oficial PNCP](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html). O manual descreve `situacaoCompraItemId`; o endpoint consultado retornou `situacaoCompraItem`.
- Código da paginação de `tabulator-tables@6.3.1`, utilizado na aplicação, e [documentação oficial](https://www.tabulator.info/docs/6.x/page/).
