# Publicar no Railway

A configuração em [`.railway/railway.ts`](../.railway/railway.ts) usa o Dockerfile existente, Node.js 24, uma réplica, healthcheck em `/api/health` com timeout de 60 segundos e até dez reinícios em caso de falha. Frontend e API ficam no mesmo serviço. Não é necessário banco de dados, volume ou compilação da interface.

O arquivo usa o formato atual de [Infrastructure as Code do Railway](https://docs.railway.com/infrastructure-as-code). Ele é aplicado pela CLI; o deploy de código não o aplica automaticamente. A dependência de desenvolvimento `railway` fornece o SDK e não entra na imagem de produção, que instala com `npm ci --omit=dev`.

## Primeira publicação

Na raiz do projeto, com Node.js 24 e Railway CLI **5.42.1 ou superior**:

```sh
npm ci
npm install -g @railway/cli
railway --version
railway login
railway init
railway config plan
railway config apply
railway up --service compras-web
railway domain --service compras-web
```

`railway init` cria e vincula um projeto. Para usar um projeto existente, substitua esse comando por `railway link` e selecione o projeto e o ambiente desejados. `plan` mostra as alterações; `apply` solicita confirmação e configura o serviço `compras-web`. `up` envia o código local para build e deploy. `domain` gera o endereço HTTPS público.

O arquivo exporta a partial `compras-web`, que administra apenas os recursos declarados por este repositório. Em um serviço existente, ajuste o nome em `service('compras-web', ...)` para coincidir com o painel e revise o plano, incluindo alterações em variáveis. Se houver configurações próprias que devem ser mantidas, inclua-as no arquivo antes de aplicar; valores já cadastrados podem ser mantidos com `preserve()` do SDK.

## Deploy por GitHub

Após aplicar a configuração, conecte o repositório e a branch ao serviço `compras-web` em **Settings → Source**. Use a raiz do repositório como diretório do serviço. O build usa o `Dockerfile` e o comando de inicialização já está configurado.

Pushes para a branch conectada publicam o código. Ao alterar `.railway/railway.ts`, execute novamente `railway config plan` e `railway config apply` para atualizar a infraestrutura. O arquivo não fixa uma origem GitHub para permitir também publicação pela CLI.

## Variáveis e recursos

| Variável | Configuração |
| --- | --- |
| `HOST` | `0.0.0.0`, definida no arquivo Railway |
| `NODE_ENV` | `production`, definida no arquivo Railway |
| `DEMO_MODE` | `false`, definida no arquivo Railway |
| `PORT` | Fornecida pelo Railway; não copie a porta da `.env` local |
| `PNCP_*` | Opcionais; os padrões estão em `src/config.js` e `.env.example` |

Para personalizar limites, timeouts ou filtros, acrescente as variáveis necessárias em `env` no arquivo Railway e reaplique a configuração. `PNCP_VALIDATED_FILTERS` habilita argumentos adicionais após a verificação descrita no README.

A `.env` local não é incluída na imagem Docker. Não importe variáveis de proxy usadas somente na sua rede local. O serviço precisa de saída HTTPS para `pncp.gov.br`.

Mantenha uma réplica: os limites de chamadas ao PNCP são por processo. Dimensione a memória com folga sobre os 512 MiB do heap principal, pois buffers têm consumo adicional. O heap não limita o consumo total do contêiner.

## Conferir a publicação

Abra o domínio gerado e consulte:

```sh
curl https://SEU-DOMINIO.up.railway.app/api/health
curl https://SEU-DOMINIO.up.railway.app/api/schema
railway logs --service compras-web
```

O healthcheck deve retornar HTTP 200, `status: "ok"` e `source: "pncp"`. Ele verifica o processo sem chamar o PNCP; faça uma pesquisa pela interface para verificar também a conectividade com a fonte externa.

Para enviar novas versões pela CLI, execute `railway up --service compras-web`.
