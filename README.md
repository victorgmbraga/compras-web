# Compras Web

Aplicação para pesquisar contratações públicas diretamente nas APIs do Portal Nacional de Contratações Públicas (PNCP). A interface usa Tabulator, e o servidor Node.js entrega tanto a página quanto a API da aplicação.

Texto, filtros, ordenação e paginação são enviados ao PNCP. Cada pesquisa consulta novamente a fonte. Os resultados ficam em memória durante o uso; a aplicação não requer banco de dados nem volume persistente.

## Executar localmente

Requer **Node.js 22.9 ou superior**, com Node.js 24 recomendado, e npm. Para consultas reais, o servidor precisa de acesso HTTPS a `pncp.gov.br`; a API pública utilizada não exige credenciais.

```sh
npm ci
npm start
```

No computador em que o servidor estiver rodando, abra `http://localhost:8000`. Para ajustar porta, endereço de escuta, timeouts ou limites, copie [`.env.example`](.env.example) para `.env` e consulte o [guia de configuração](docs/configuracao.md).

Para usar a aplicação sem acesso ao PNCP:

```sh
npm run demo
```

A demonstração é identificada na interface e usa 64 contratações fictícias. Ela é uma fonte simplificada para desenvolvimento; não reproduz todos os filtros e critérios de ordenação do PNCP. Falhas na fonte real são apresentadas como erros, sem ativar a demonstração automaticamente.

## Usar a interface

1. A página inicia uma pesquisa sem filtros e mostra até 100 contratações por página. Digite um texto para pesquisar e escolha a ordenação por publicação ou relevância; relevância exige texto.
2. Abra **Filtros** para definir status, período de publicação, UF, órgão, unidade, município, código IBGE, esfera, poder, modalidade, modo de disputa, situação, ano, SRP, sistema de origem, instrumento convocatório, fonte orçamentária, normativo e amparo legal, valores e filtros de itens habilitados. Também há condições de orçamento sigiloso, vínculos com atas, contratos ou empenhos e notas fiscais, e exigência de conteúdo nacional. Órgãos e unidades são selecionados pelos IDs fornecidos pelo PNCP. Os campos são agrupados por contratação, item, resultado e fornecedor; campos exclusivos de contratos têm uma indicação própria de indisponibilidade.
3. Use a paginação para consultar outras páginas. **Atualizar** repete os últimos critérios concluídos na página atual; novos critérios começam na primeira página. **Cancelar** interrompe a pesquisa em andamento. Uma falha mantém e identifica o resultado anterior.
4. Clique em uma contratação para ver seus dados, links e itens. Os itens são carregados automaticamente quando a fonte fornece CNPJ, ano e sequencial válidos, com quantidade, situação e valores estimados.
5. Use **Colunas** para escolher os campos visíveis. O menu de cada coluna oferece as ações de filtro e ordenação nativas disponíveis.
6. **Exportar CSV** faz uma nova coleta com os últimos critérios concluídos e inicia o download. O arquivo contém todas as colunas documentais, independentemente da seleção visual.

Os 30 filtros habilitados são publicados em `/api/schema`. Nas condições Sim/Não, informação ausente não equivale a Não; remova o filtro para não restringir por essa condição. Campos que ainda exibem **pendente** continuam aguardando comprovação na fonte.

O total apresentado é o informado pelo PNCP. A navegação alcança no máximo 10.000 documentos; acima desse valor, a interface exibe um aviso. A exportação exige que o total caiba no limite configurado: delimite a pesquisa quando necessário. Alterações na fonte entre chamadas podem fazer o CSV diferir da tabela.

## Desenvolver e validar

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor com reinício e recarga automática ao alterar a aplicação |
| `npm run dev -- --demo` | Desenvolvimento com dados fictícios |
| `npm test` | Suíte automatizada com o runner nativo do Node.js |
| `npm run build` | Recria a distribuição em `dist/` |
| `npm run benchmark:demo` | Mede pesquisa, paginação e exportação com fonte sintética |

O modo de desenvolvimento observa `src/`, `public/`, `.env`, `package.json` e `package-lock.json`. As tarefas do editor Zed estão em [`.zed/tasks.json`](.zed/tasks.json). O [guia de validação](docs/validacao.md) descreve a cobertura, a verificação HTTP e o teste opcional em navegador, incluindo suas limitações atuais.

## API

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/schema` | Colunas, filtros disponíveis, ordenações e limites |
| POST | `/api/query` | Consulta de uma página |
| GET | `/api/pncp/filters` | Opções dos domínios de filtros |
| GET | `/api/pncp/suggest` | Sugestões para filtros de lista habilitados |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/itens` | Quantidade e página de itens |
| POST | `/api/export` | Nova coleta e download CSV |
| GET | `/api/health` | Estado do processo e dados da última chamada ao PNCP |

Exemplo de corpo JSON para `POST /api/query`:

```json
{
  "api_version": "2.0",
  "document_type": "edital",
  "q": "firewall",
  "status": "todos",
  "pncp_filters": {"ufs": ["DF"]},
  "order": "-data",
  "page": 1,
  "size": 100
}
```

O contrato completo, os tipos dos filtros e os formatos das respostas estão em [Consultas ao PNCP](docs/consultas-pncp.md). `/api/health` verifica o processo; para confirmar o acesso ao PNCP, execute também uma pesquisa.

A configuração padrão habilita 30 filtros. Outros 41 filtros de contratações dependem de validação do efeito remoto; nove pertencem exclusivamente a contratos. O [planejamento dos filtros](docs/viabilidade-filtros-pncp.md) descreve os critérios de liberação e as próximas etapas. Ao alterar o normativo legal, a interface confere os amparos selecionados e remove os incompatíveis antes de aplicar a pesquisa.

## Distribuir e publicar

Para executar a distribuição Node.js:

```sh
npm run build
cd dist
npm ci --omit=dev
npm start
```

O build remove o conteúdo anterior de `dist/`. A `.env` local não é copiada: configure as variáveis no destino ou crie ali a configuração necessária.

O [Dockerfile](Dockerfile) usa Node.js 24 e executa a aplicação com usuário sem privilégios:

```sh
docker build -t compras-web-pncp .
docker run --rm -p 8000:8000 compras-web-pncp
```

Para personalizar o contêiner, use `-e NOME=valor` ou `--env-file .env`; ao reutilizar a configuração local, acrescente `-e HOST=0.0.0.0` para aceitar conexões externas ao contêiner.

O [guia Railway](docs/railway.md) explica como publicar o serviço e obter um domínio HTTPS. Os limites de chamadas são por processo; a configuração fornecida usa uma réplica. Os comandos de execução limitam o heap a 512 MiB, e o consumo total inclui buffers e outras alocações.

## Documentação

- [Arquitetura e organização do código](docs/arquitetura.md)
- [Configuração, rede e limites](docs/configuracao.md)
- [Contrato da API e consultas ao PNCP](docs/consultas-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Publicação no Railway](docs/railway.md)

Os avisos de licença do Tabulator e dos ícones usados na interface estão em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
