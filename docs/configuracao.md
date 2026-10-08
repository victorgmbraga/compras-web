# Configuração, rede e limites

Os padrões compartilhados estão em [`src/settings.js`](../src/settings.js). No modo Node.js, [`src/config.js`](../src/config.js) lê variáveis de ambiente, e [`.env.example`](../.env.example) lista as opções para configuração local. Os comandos `npm start`, `npm run demo` e `npm run dev` carregam a `.env` da pasta de execução quando ela existe. Variáveis já definidas no processo têm prioridade sobre o arquivo.

Crie `.env` a partir do exemplo apenas quando precisar personalizar os padrões. O arquivo é ignorado pelo Git. Na hospedagem ou no contêiner, configure as variáveis pelo mecanismo do serviço.

## Configuração pública da versão estática

Edite [`public/browser-config.json`](../public/browser-config.json) antes de `npm run build:browser`, ou o `browser-config.json` publicado para alterar somente limites e modo. `{}` aplica os padrões da tabela abaixo. Todas as chaves compartilhadas são permitidas, exceto as opções exclusivas de Node.js (`HOST`, `PORT`, `PNCP_CONNECT_TIMEOUT_SECONDS`). Valores numéricos e booleanos devem ser tipos JSON, e `PNCP_VALIDATED_FILTERS` continua sendo texto.

```json
{
  "DEMO_MODE": false,
  "PNCP_PAGE_SIZE": 50,
  "PNCP_MAX_EXPORT_DOCUMENTS": 10000
}
```

O arquivo inteiro é público. Chaves desconhecidas são rejeitadas; `.env`, credenciais, proxy e variáveis do processo não entram no bundle. As bases do navegador devem ser exatamente as bases públicas padrão do PNCP. `?demo=1` escolhe demonstração explicitamente; `npm run demo:browser` também a ativa.

Cada aba da aplicação possui um Worker, um cliente e uma fila compartilhada entre pesquisa, detalhes e CSV. Concorrência e ritmo são **por aba**, sem coordenação com outras abas ou dispositivos. Excesso de operações gera `CONCURRENCY_LIMIT`, com possibilidade de repetir. Os números de status dos erros são da aplicação; `details.upstream_status` só existe quando houve resposta HTTP legível da fonte.

O navegador usa `GET`, `mode: cors`, `credentials: omit`, `cache: no-store`, `redirect: error` e somente `Accept: application/json`. Ele não segue redirecionamentos e não promete o timeout de conexão do agente Node.js. CORS, TLS e offline podem resultar em `PNCP_TRANSPORT_ERROR` sem HTTP conhecido. `Retry-After` só é considerado quando CORS permite ler esse cabeçalho; caso contrário, a espera local limitada permanece. O prazo absoluto também é conferido após retomar atividade.

## Endereço e fonte

| Variável | Padrão | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Endereço de escuta; use `0.0.0.0` para acesso externo ao processo em hospedagem ou contêiner |
| `PORT` | `8000` | Porta inteira entre 1 e 65.535 |
| `DEMO_MODE` | `false` | `true` ativa dados sintéticos; `false` consulta o PNCP |
| `PNCP_SEARCH_BASE_URL` | `https://pncp.gov.br/api/search` | Base para pesquisa, filtros e sugestões |
| `PNCP_DETAIL_BASE_URL` | `https://pncp.gov.br/api/pncp/v1` | Base para documentos, itens, arquivos e demais listagens dos detalhes |
| `PNCP_VALIDATED_FILTERS` | Vazio | Nomes de filtros adicionais validados, separados por vírgula |

As URLs base exigem HTTPS e não podem conter credenciais, query string ou fragmento. No modo Node.js, o cliente só segue redirecionamentos HTTPS para a mesma origem, com limite de três.

Os argumentos `--host` e `--port` substituem os respectivos valores de configuração:

```sh
npm start -- --host 127.0.0.1 --port 8100
npm run dev -- --demo --port 8100
```

`--demo`, usado por `npm run demo`, ativa a demonstração mesmo quando `DEMO_MODE=false`.

## Tempos e concorrência

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `PNCP_CONNECT_TIMEOUT_SECONDS` | `5` | Somente Node.js: timeout de conexão do agente |
| `PNCP_READ_TIMEOUT_SECONDS` | `30` | Timeout da requisição à fonte, incluindo a leitura |
| `PNCP_OPERATION_TIMEOUT_SECONDS` | `120` | Prazo total da operação, incluindo fila e tentativas |
| `PNCP_MAX_RETRIES` | `2` | Novas tentativas após a chamada inicial; `0` desativa novas tentativas |
| `PNCP_MAX_CONCURRENT_REQUESTS` | `2` | Chamadas simultâneas à fonte por processo Node.js ou Worker |
| `PNCP_REQUESTS_PER_SECOND` | `2` | Ritmo de início de chamadas por processo Node.js ou Worker |
| `PNCP_MAX_CONCURRENT_OPERATIONS` | `4` | Operações simultâneas; excedentes recebem `CONCURRENCY_LIMIT` (HTTP 429 na API Node.js) |

O cliente tenta novamente erros de transporte e respostas HTTP 429, 502, 503 e 504 dentro do orçamento de tentativas e tempo. Aplica espera crescente e considera `Retry-After` da fonte. No modo Node.js, as rotas de esquema e saúde não consomem o limite de operações. A versão estática não possui healthcheck HTTP.

## Paginação e orçamento

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `PNCP_PAGE_SIZE` | `50` | Tamanho padrão da API e das chamadas de exportação; aceita 10, 25, 50 ou 100 |
| `PNCP_MAX_DETAIL_ITEMS` | `20000` | Limite de itens recebidos por operação de detalhes |
| `PNCP_MAX_EXPORT_DOCUMENTS` | `10000` | Total máximo aceito para exportar; não pode superar 10.000 |
| `PNCP_MAX_EXPORT_BYTES` | `52428800` (50 MiB) | Limite do CSV montado em memória |
| `PNCP_MAX_OPERATION_BYTES` | `104857600` (100 MiB) | Soma dos bytes lidos das respostas da fonte na operação |
| `PNCP_MAX_REQUESTS_PER_OPERATION` | `1000` | Orçamento de chamadas, incluindo domínios, tentativas e redirecionamentos |

A interface usa 100 linhas por página de documentos pesquisados e por página de itens, e dez registros por página nas demais listagens dos detalhes. Alterar `PNCP_PAGE_SIZE` não muda esses tamanhos visuais. A janela de busca é fixa em 10.000 documentos.

Os limites numéricos exigem valores de pelo menos 1, exceto `PNCP_MAX_RETRIES`, que aceita zero; porta, tamanhos de página e limites `MAX_*` exigem inteiros. Somente os scripts de execução Node.js usam heap de 512 MiB; o navegador administra sua própria memória. Dimensione a memória total com margem para buffers, respostas e CSV.

## Habilitar filtros adicionais

O método `schema` no Worker e `GET /api/schema` no Node.js publicam os 80 filtros implementados: 71 de contratações, 16 de atas e 32 de contratos. Não é necessário preencher `PNCP_VALIDATED_FILTERS` para usá-los. A variável permanece por compatibilidade e declara conferência externa feita pelo operador (`validation_status: operator_declared`); não comprova o efeito remoto nem altera a compatibilidade documental. Nomes desconhecidos ou reservados continuam sendo rejeitados.

As capacidades publicam tipo, cardinalidade, contexto, provedor de domínio e evidência disponível. Domínios fechados exigem pertencimento ao catálogo antes da pesquisa e do CSV; listas parciais usam sugestões. Países preservam o ID alfabético do catálogo PNCP, como `BRA`, sem convertê-lo para código BCB. Reservas/remanescentes usam a enumeração fixa do portal. Consulte a [lista completa](consultas-pncp.md#filtros-habilitados-por-padrão) e o [alcance da verificação externa](viabilidade-filtros-pncp.md).

## Rede e implantação

Instalar dependências requer acesso ao registro npm. No modo estático real, cada navegador precisa de acesso HTTPS ao PNCP e respostas com CORS válido. A hospedagem serve módulos, Worker e configuração com MIME correto; consulte [Hospedagem estática](hospedagem-estatica.md). No modo Node.js real, o backend precisa alcançar `pncp.gov.br` por HTTPS. O navegador acessa a mesma origem da aplicação para carregar os recursos e consultar a API.

Somente o adaptador Node.js usa `EnvHttpProxyAgent` do Undici quando `HTTPS_PROXY` ou `HTTP_PROXY` está definido e considera a configuração de exclusões `NO_PROXY`. Preserve a cadeia de certificados confiáveis da rede; não desative a verificação TLS para contornar falhas.

O Dockerfile e a configuração Railway iniciam o servidor diretamente com Node.js. Eles dependem das variáveis injetadas no processo. A `.env` da máquina de desenvolvimento não é incluída na imagem ou na distribuição gerada.

`HOST=0.0.0.0` permite escuta externa, mas o acesso público ainda depende do mapeamento de portas ou domínio da hospedagem. Consulte [Publicar no Railway](railway.md).

Na exportação, os padrões de 50 registros/página e duas chamadas/segundo podem consumir cerca de 100 segundos apenas para agendar 10.000 documentos. O prazo de 120 segundos pode encerrar uma coleta lenta. Refine critérios ou ajuste limites conscientemente; o limite sintético validado não garante duração de consultas reais. O CSV é codificado em lotes, limitado a 50 MiB e transferido como buffers; nenhuma coleção completa de documentos acompanha a resposta do Worker.
