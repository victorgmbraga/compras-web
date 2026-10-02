# Compras Web 2.0.3 — tabela e detalhes

Data: 02/10/2026.

- **Título** fica visível por padrão e aparece antes das demais colunas da tabela e do seletor de colunas.
- **Município** fica visível por padrão, após UF.
- Abrir uma contratação consulta automaticamente a primeira página de itens. Os detalhes aparecem imediatamente e mostram o andamento da consulta. Os controles permitem atualizar, repetir após erro e navegar pelas páginas de itens. Fechar os detalhes cancela a consulta em andamento. Quando a fonte não fornece CNPJ, ano e sequencial, o painel informa essa ausência sem tentar uma requisição inválida.
- O link **Abrir no PNCP** converte os caminhos `/compras/{cnpj}/{ano}/{sequencial}` e `/app/compras/{cnpj}/{ano}/{sequencial}` da busca em `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`. URLs absolutas da mesma origem recebem a mesma correção. Links já corretos em `/app/editais/` são preservados. A normalização também se aplica à coluna Link PNCP e à exportação.

A ordem das colunas no CSV permanece estável: a alteração de posição do Título é aplicada na interface.

**Verificação:** 63 testes automatizados passaram. As novas regressões cobrem a consulta automática ao abrir uma linha, colunas visíveis e sua ordem, link corrigido, identificação ausente e nova tentativa após falha. A regressão existente de links foi atualizada para exigir `/app/editais/` em caminhos relativos e absolutos, mantendo a rejeição de origens externas e links executáveis.

Os testes do frontend executam os handlers reais com DOM mínimo e adaptador de Tabulator, integrados ao serviço com respostas sintéticas. Não verificam a renderização do navegador nem a disponibilidade ao vivo do PNCP. O script opcional de navegador foi atualizado para aguardar os itens sem clicar em Consultar itens. Capturas e respostas registradas em relatórios anteriores são evidências das versões indicadas nesses relatórios.

**Atualização:** preserve sua `.env`, substitua os arquivos pelo pacote 2.0.3, execute `npm ci` e reinicie a aplicação. O contrato HTTP permanece em 2.0.
