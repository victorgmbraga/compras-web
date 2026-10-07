# Configuração, rede e limites

Os padrões estão em [`src/config.js`](../src/config.js), e [`.env.example`](../.env.example) lista as opções para configuração local. Os comandos `npm start`, `npm run demo` e `npm run dev` carregam a `.env` da pasta de execução quando ela existe. Variáveis já definidas no processo têm prioridade sobre o arquivo.

Crie `.env` a partir do exemplo apenas quando precisar personalizar os padrões. O arquivo é ignorado pelo Git. Na hospedagem ou no contêiner, configure as variáveis pelo mecanismo do serviço.

## Endereço e fonte

| Variável | Padrão | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Endereço de escuta; use `0.0.0.0` para acesso externo ao processo em hospedagem ou contêiner |
| `PORT` | `8000` | Porta inteira entre 1 e 65.535 |
| `DEMO_MODE` | `false` | `true` ativa dados sintéticos; `false` consulta o PNCP |
| `PNCP_SEARCH_BASE_URL` | `https://pncp.gov.br/api/search` | Base para pesquisa, filtros e sugestões |
| `PNCP_DETAIL_BASE_URL` | `https://pncp.gov.br/api/pncp/v1` | Base para quantidade e páginas de itens |
| `PNCP_VALIDATED_FILTERS` | Vazio | Nomes de filtros adicionais validados, separados por vírgula |

As URLs base exigem HTTPS e não podem conter credenciais, query string ou fragmento. O cliente só segue redirecionamentos HTTPS para a mesma origem, com limite de três.

Os argumentos `--host` e `--port` substituem os respectivos valores de configuração:

```sh
npm start -- --host 127.0.0.1 --port 8100
npm run dev -- --demo --port 8100
```

`--demo`, usado por `npm run demo`, ativa a demonstração mesmo quando `DEMO_MODE=false`.

## Tempos e concorrência

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `PNCP_CONNECT_TIMEOUT_SECONDS` | `5` | Timeout de conexão configurado no cliente |
| `PNCP_READ_TIMEOUT_SECONDS` | `30` | Timeout da requisição à fonte, incluindo a leitura |
| `PNCP_OPERATION_TIMEOUT_SECONDS` | `120` | Prazo total da operação, incluindo fila e tentativas |
| `PNCP_MAX_RETRIES` | `2` | Novas tentativas após a chamada inicial; `0` desativa novas tentativas |
| `PNCP_MAX_CONCURRENT_REQUESTS` | `2` | Chamadas simultâneas à fonte por processo |
| `PNCP_REQUESTS_PER_SECOND` | `2` | Ritmo de início de chamadas por processo |
| `PNCP_MAX_CONCURRENT_OPERATIONS` | `4` | Operações simultâneas na API; excedentes recebem HTTP 429 |

O cliente tenta novamente erros de transporte e respostas HTTP 429, 502, 503 e 504 dentro do orçamento de tentativas e tempo. Aplica espera crescente e considera `Retry-After` da fonte. As rotas de esquema e saúde não consomem o limite de operações.

## Paginação e orçamento

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `PNCP_PAGE_SIZE` | `50` | Tamanho padrão da API e das chamadas de exportação; aceita 10, 25, 50 ou 100 |
| `PNCP_MAX_DETAIL_ITEMS` | `20000` | Limite de itens recebidos por operação de detalhes |
| `PNCP_MAX_EXPORT_DOCUMENTS` | `10000` | Total máximo aceito para exportar; não pode superar 10.000 |
| `PNCP_MAX_EXPORT_BYTES` | `52428800` (50 MiB) | Limite do CSV montado em memória |
| `PNCP_MAX_OPERATION_BYTES` | `104857600` (100 MiB) | Soma dos bytes lidos das respostas da fonte na operação |
| `PNCP_MAX_REQUESTS_PER_OPERATION` | `1000` | Orçamento de chamadas, incluindo domínios, tentativas e redirecionamentos |

A interface usa 100 linhas por página de contratações e por página de itens. Alterar `PNCP_PAGE_SIZE` não muda esse tamanho visual. A janela de busca é fixa em 10.000 documentos.

Os limites numéricos exigem valores de pelo menos 1, exceto `PNCP_MAX_RETRIES`, que aceita zero; porta, tamanhos de página e limites `MAX_*` exigem inteiros. Os scripts de execução usam heap de 512 MiB. Dimensione a memória total com margem para buffers, respostas e CSV.

## Habilitar filtros adicionais

`GET /api/schema` publica o catálogo e o estado de cada capacidade. Antes de incluir um nome em `PNCP_VALIDATED_FILTERS`:

1. Confira seu tipo, contexto documental e domínio em [`src/pncp-arguments.json`](../src/pncp-arguments.json).
2. Verifique na API real o formato aceito e o efeito do argumento sobre a consulta.
3. Acrescente o nome à lista separada por vírgulas e reinicie o processo.
4. Confira a capacidade em `/api/schema` e valide uma consulta representativa.

A configuração amplia a lista padrão; não desativa filtros já habilitados. Nomes desconhecidos ou reservados são rejeitados. O filtro também precisa ser aplicável a `edital`; a variável não implementa suporte a outros tipos documentais.

A lista padrão possui 37 filtros. Além dos filtros documentais, inclui emenda parlamentar, critério de julgamento, categoria de leilão, benefício do item, incentivo produtivo básico e aplicabilidade de margens de preferência normal e adicional. Não é necessário preencher `PNCP_VALIDATED_FILTERS` para utilizá-los; consulte a [lista completa](consultas-pncp.md#filtros-habilitados-por-padrão). As capacidades publicam o provedor de domínio e a cardinalidade esperada. A ativação de um filtro com domínio fechado também exige pertencimento às opções retornadas pelo PNCP; não basta fornecer um ID com formato válido. Para países de fornecedores, a identidade utilizada pela busca ainda está em investigação, mesmo com o catálogo conectado.

## Rede e implantação

Instalar dependências requer acesso ao registro npm. No modo real, o backend precisa alcançar `pncp.gov.br` por HTTPS. O navegador acessa a mesma origem da aplicação para carregar os recursos e consultar a API.

O cliente usa `EnvHttpProxyAgent` do Undici quando `HTTPS_PROXY` ou `HTTP_PROXY` está definido e considera a configuração de exclusões `NO_PROXY`. Preserve a cadeia de certificados confiáveis da rede; não desative a verificação TLS para contornar falhas.

O Dockerfile e a configuração Railway iniciam o servidor diretamente com Node.js. Eles dependem das variáveis injetadas no processo. A `.env` da máquina de desenvolvimento não é incluída na imagem ou na distribuição gerada.

`HOST=0.0.0.0` permite escuta externa, mas o acesso público ainda depende do mapeamento de portas ou domínio da hospedagem. Consulte [Publicar no Railway](railway.md).
