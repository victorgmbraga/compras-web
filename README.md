# Compras Web — consulta direta ao PNCP

Aplicação Node.js com Tabulator para pesquisar contratações diretamente na API do PNCP. Texto, filtros, ordenação e paginação são enviados à fonte; cada página faz uma nova consulta. A interface inicia automaticamente uma pesquisa sem filtros e exibe 100 contratações por página.

## Executar

Requer Node.js 22.9 ou superior; recomendado Node.js 24.

```sh
npm ci
npm start
```

Abra http://localhost:8000. Para configurar porta, limites e timeouts, copie `.env.example` para `.env` e ajuste os valores.

```sh
npm run dev
npm test
npm run build
```

O desenvolvimento observa alterações em `public/`, `src/` e `.env`, reinicia o servidor quando necessário e recarrega a página aberta. A recarga automática fica restrita a `npm run dev`.

O build recria `dist/`, removendo arquivos antigos da distribuição. Nessa pasta, execute `npm ci --omit=dev` e `npm start`. As opções de execução, demonstração, testes e build estão em [`.zed/tasks.json`](.zed/tasks.json).

Para desenvolvimento sem acesso ao PNCP, `npm run demo` e `npm run dev -- --demo` usam respostas sintéticas identificadas na interface. Não existe fallback automático para dados de demonstração. `npm run benchmark:demo` mede o processamento com essa fonte sintética.

## Utilização

- Pesquise pelo texto indexado pelo PNCP e abra **Filtros** para selecionar status, período de publicação, UF, órgão, unidade, município, esfera, poder, modalidade, situação, ano, valores e filtros de itens habilitados. Órgãos e unidades usam IDs e sugestões fornecidos pelo PNCP.
- Ordene por mais recentes, mais antigas ou relevância com texto de pesquisa. O menu das colunas oferece apenas filtros e ordenações que têm equivalente na API.
- A tabela mostra o total informado pelo PNCP. Acima de 10.000 resultados, o ícone de alerta explica a janela acessível ao passar o mouse. Outros avisos e erros aparecem acima da tabela.
- Consulta, atualização e paginação exibem o loader. **Cancelar** interrompe a requisição; uma falha preserva e identifica o resultado anterior.
- Clique em uma contratação para consultar os detalhes e itens. A paginação usa a quantidade informada pelo PNCP; os itens mostram quantidade, valor unitário estimado e valor total estimado.
- **Exportar CSV** consulta novamente todas as páginas dos últimos critérios concluídos, respeitando o limite configurado e a janela de 10.000 documentos. A exportação falha se houver mudança de total, duplicação ou páginas incompletas durante a coleta.

Consultas prontas, refinamento local, regex, categorias, agrupamento e ordenação local foram removidos. Os resultados preservam a ordem e a seleção retornadas pelo PNCP.

## API da aplicação

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/schema` | Colunas, capacidades e limites |
| POST | `/api/query` | Pesquisa de uma página no PNCP |
| GET | `/api/pncp/filters?tipos_documento=edital` | Domínios de filtros |
| GET | `/api/pncp/suggest` | Sugestões de órgão, unidade e município |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/itens` | Quantidade e página de itens |
| POST | `/api/export` | Recebe `{query}` e devolve CSV após nova coleta |
| GET | `/api/health` | Estado do processo e última chamada |

Exemplo de corpo para `POST /api/query`:

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

O contrato aceita apenas esses oito campos. Parâmetros antigos de consulta local são rejeitados com `UNKNOWN_FIELD`. A exportação recebe o mesmo objeto no campo `query`, sem `scope` ou opção de resultados confirmados. Veja [consultas-pncp.md](docs/consultas-pncp.md).

O registro de capacidades contém 87 argumentos. Apenas os habilitados para `edital` são aceitos; argumentos pendentes geram erro explícito. Para habilitar outro filtro após verificar seu domínio, formato e efeito no PNCP, configure `PNCP_VALIDATED_FILTERS`. Os padrões e limites estão em [`.env.example`](.env.example).

Todos os dados usam `Cache-Control: no-store`. Não há banco, importação, histórico de resultados, localStorage ou cache persistente de contratações. As rotas antigas de importação retornam HTTP 410.

Decimais são preservados como strings, inclusive os valores dos itens. O CSV usa UTF-8 com BOM, todas as colunas documentais e escape de aspas e quebras. Dados da fonte podem mudar entre páginas; `snapshot_guaranteed` permanece `false`.

## Implantação

O [guia Railway](docs/railway.md) explica a configuração [`.railway/railway.ts`](.railway/railway.ts). Frontend e backend ficam no mesmo serviço, sem banco ou volume. Também há um Dockerfile:

```sh
docker build -t compras-web-pncp .
docker run --rm -p 8000:8000 --env-file .env compras-web-pncp
```

Configure `HOST=0.0.0.0` na hospedagem. Os limites de concorrência e chamadas por segundo são por processo; use uma réplica ou coordene esses limites externamente. Os scripts limitam o heap a 512 MiB, e buffers consomem memória adicional.

A aplicação usa `node:http`, Tabulator, `lossless-json` e Undici. A licença do Tabulator e dos ícones está em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). O [relatório de validação](docs/validacao.md) descreve os testes atuais; a especificação e auditorias anteriores em `docs/` são referências históricas.
