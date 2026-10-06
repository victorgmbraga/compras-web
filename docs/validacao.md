# Validação — consultas diretas ao PNCP

Data: 6 de outubro de 2026. Ambiente: Windows, Node.js 24.21.0 e Tabulator 6.3.1.

## Testes automatizados

`npm test` concluiu **64 testes, sem falhas**. A saída completa está em [test-results.txt](test-results.txt).

A suíte cobre o contrato de consulta nativa, serialização e validação dos filtros, cancelamento, timeouts, novas chamadas a cada pesquisa, paginação remota, janela de 10.000 documentos, consistência da exportação, precisão decimal, detalhes e quantidade de itens, loader, tratamento de erro e hot reload.

As regressões de consulta direta verificam que:

- Cada página solicitada faz apenas uma chamada de busca, mesmo com 2.500 resultados e objetos repetidos.
- A ordem e os documentos da fonte são preservados, sem filtragem ou agrupamento local.
- Texto, status, datas, UF e filtros de itens são enviados como parâmetros nativos.
- Pesquisas não consultam itens automaticamente; eles são carregados nos detalhes.
- Parâmetros antigos de regras, presets, modos locais, agrupamento e ordenação local são rejeitados antes da rede.
- A exportação percorre as páginas remotas e falha diante de mudanças, duplicatas ou páginas incompletas, sem CSV parcial.

Os testes usam respostas sintéticas e handlers reais do frontend com DOM mínimo. Eles não certificam cada filtro catalogado no PNCP nem a disponibilidade contínua da fonte.

## Integração real

Foi realizada uma consulta por `POST /api/query` através do servidor da aplicação, com `q=firewall`, `status=todos`, `order=-data`, `page=1` e `size=10`. A API real do PNCP respondeu **HTTP 200**, com 10 documentos, total de 3.477 e uma chamada de busca. Esse total representa apenas o momento do ensaio.

## Navegador

A interface foi verificada em Chrome headless com uma fonte sintética explícita. Dez verificações passaram, sem exceções JavaScript: consulta inicial, remoção dos controles locais, filtros de UF, texto e período, detalhes com valores dos itens, paginação remota, tooltip da janela, dimensões da paginação, modal em celular e erro personalizado.

Foram conferidas larguras de 320, 390, 768, 1.057 e 1.440 pixels, sem overflow da página. A grade do modal foi ajustada para manter os filtros dentro da largura disponível em celular. Capturas foram usadas para inspeção visual, sem substituir as imagens históricas do repositório.

## Distribuição e medição

`npm run build` recria `dist/`; a distribuição é conferida para excluir módulos antigos de regras, workers e dados de presets. O servidor distribuído é iniciado e suas rotas de esquema e consulta são verificadas com fonte sintética.

O [benchmark-demo.json](benchmark-demo.json) foi atualizado para pesquisa, paginação e exportação. Ele mede processamento com HTTP sintético e não representa latência ou capacidade do PNCP.

A especificação e as auditorias anteriores foram identificadas como referências históricas. O contrato atual está em [consultas-pncp.md](consultas-pncp.md).
