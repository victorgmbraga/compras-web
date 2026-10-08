# Compras Web

Aplicação para pesquisar editais e avisos de contratações, atas de registro de preços e contratos públicos diretamente nas APIs do Portal Nacional de Contratações Públicas (PNCP). A distribuição estática executa consultas, filtros e geração de CSV no navegador, em um Web Worker. A hospedagem entrega somente arquivos; não precisa executar Node.js, API própria ou proxy. A distribuição Node.js permanece disponível como alternativa e para consumidores da API HTTP.

Texto, filtros, ordenação e paginação são enviados ao PNCP. Cada pesquisa consulta novamente a fonte. Os resultados ficam em memória durante o uso; a aplicação não requer banco de dados nem volume persistente.

## Executar no navegador

Para desenvolver e gerar os arquivos, requer **Node.js 22.12 ou superior**, com Node.js 24 recomendado, e npm. Depois do build, a hospedagem precisa apenas servir arquivos por HTTPS. Cada navegador acessa `pncp.gov.br` diretamente, sem credenciais.

```sh
npm ci
npm run dev:browser
```

Abra `http://localhost:8000`. Para usar dados fictícios explicitamente:

```sh
npm run demo:browser
```

A demonstração identifica sua fonte e contém 64 contratações, 24 atas e 32 contratos, incluindo itens e listagens relacionadas. Ela também pode ser escolhida com `?demo=1` na URL da versão estática. Falhas de acesso ao PNCP nunca ativam a demonstração automaticamente.

Para gerar e verificar a distribuição:

```sh
npm run build:browser
npm run preview:browser
```

Publique **o conteúdo de `dist-browser/`** em uma hospedagem estática. Funciona na raiz e em `/compras-web/`, com assets locais. Não abra o HTML por `file://`. A configuração pública está em [`public/browser-config.json`](public/browser-config.json); consulte [Configuração](docs/configuracao.md) e [Hospedagem estática](docs/hospedagem-estatica.md).

## Alternativa Node.js

```sh
npm start
# ou dados fictícios
npm run demo
```

Abra `http://localhost:8000`. Esse modo mantém a API HTTP e consulta o PNCP pelo servidor. Para personalizar porta, proxy e limites, use [`.env.example`](.env.example) e o [guia de configuração](docs/configuracao.md). Os dois modos compartilham filtros, projeções, validações e conferências de coleta.

## Usar a interface

1. A página inicia uma pesquisa de contratações sem filtros e mostra até 100 documentos por página. Escolha **Editais e Avisos de Contratações**, **Atas de Registro de Preços** ou **Contratos** no cabeçalho. A troca reinicia os critérios e ajusta as colunas. Digite um texto para pesquisar e escolha a ordenação por publicação ou relevância; relevância exige texto.
2. Abra **Filtros** para selecionar condições documentais, sub-rogação, itens, resultados e fornecedores. Há intervalos de quantidade, valores, classificação, homologação e desconto; catálogos de países, portes e naturezas jurídicas; e condições de adesão, benefício e preferência. Atas permitem filtros de assinatura, início de vigência e adesão. Em contratos, use também tipo, nota fiscal, fornecedor subcontratado, assinatura, início de vigência e valor global. Campos de outro tipo documental ficam indisponíveis nessa seleção. Órgãos, unidades e fornecedores usam os IDs fornecidos pelo PNCP.
3. Use a paginação para consultar outras páginas. **Atualizar** repete os últimos critérios concluídos na página atual; novos critérios começam na primeira página. **Cancelar** interrompe a pesquisa em andamento. Uma falha mantém e identifica o resultado anterior.
4. Clique em um documento para abrir seus detalhes. Os links **Abrir no PNCP** e **Sistema de origem**, quando disponíveis, ficam junto ao botão de fechar. Em contratações, as abas **Detalhes**, **Itens**, **Arquivos**, **Atas de Registro de Preço**, **Contratos/Empenhos** e **Histórico** têm contadores; as cinco listagens carregam sua primeira página automaticamente em segundo plano. Cada aba preserva sua paginação e permite repetir uma consulta que falhou. Arquivos têm links de download; atas e contratos têm links para o PNCP. Atas têm abas **Detalhes**, **Partes envolvidas**, **Contratos**, **Arquivos** e **Histórico**. Contratos têm **Detalhes**, **Empenhos**, **Instrumentos de cobrança**, **Termos**, **Arquivos** e **Histórico**. Seus dados completos e primeiras páginas carregam em segundo plano. Os detalhes incluem a contratação de origem, assinatura e vigência; atas mostram cancelamento e adesão, enquanto contratos mostram processo, fornecedor, valores e parcelas. Arquivos de termos e detalhes de empenhos/instrumentos podem ser abertos no registro selecionado.
5. Use **Colunas** para escolher os campos visíveis. O menu de cada coluna oferece as ações de filtro e ordenação nativas disponíveis.
6. **Exportar CSV** faz uma nova coleta com os últimos critérios concluídos e inicia o download. O arquivo contém todas as colunas documentais, independentemente da seleção visual. A exportação mostra progresso e pode ser interrompida com **Cancelar CSV**.

Os **80 filtros do catálogo estão implementados**, sem filtros pendentes: 71 aplicáveis a contratações, 16 a atas e 32 a contratos. A compatibilidade é informada por documento. O esquema compartilhado publica tipos, contextos, domínios e alcance da validação. Nas condições Sim/Não, informação ausente não equivale a Não. Filtros de itens e resultados selecionam contratações; os detalhes mantêm todos os itens, e condições diferentes podem corresponder a registros filhos diferentes. Tabela e CSV têm uma linha por documento.

O total apresentado é o informado pelo PNCP. A navegação alcança no máximo 10.000 documentos; acima desse valor, a interface exibe um aviso. A exportação exige que o total caiba no limite configurado: delimite a pesquisa quando necessário. Alterações na fonte entre chamadas podem fazer o CSV diferir da tabela.

## Desenvolver e validar

| Comando | Finalidade |
| --- | --- |
| `npm run dev:browser` | Desenvolvimento estático com Vite |
| `npm run demo:browser` | Desenvolvimento estático com fonte fictícia |
| `npm run build:browser` | Compila aplicação e Worker em `dist-browser/` |
| `npm run preview:browser` | Serve somente o artefato estático para verificação |
| `npm run test:browser` | Testa interface estática, CORS controlado, artefato e CSV de 10.000 documentos |
| `npm run test:ui` | Testa a interface no modo Node.js |
| `npm run dev` | Servidor com reinício e recarga automática ao alterar a aplicação |
| `npm run dev -- --demo` | Desenvolvimento com dados fictícios |
| `npm test` | Suíte automatizada com o runner nativo do Node.js |
| `npm run build` | Recria a distribuição em `dist/` |
| `npm run benchmark:demo` | Mede pesquisa, paginação e exportação com fonte sintética |

O modo de desenvolvimento Node.js observa `src/`, `public/`, `.env`, `package.json` e `package-lock.json`. As tarefas do editor Zed estão em [`.zed/tasks.json`](.zed/tasks.json). O [guia de validação](docs/validacao.md) descreve a cobertura, a verificação HTTP e o teste opcional em navegador, incluindo suas limitações atuais.

## API da distribuição Node.js

As rotas abaixo existem somente quando o servidor Node.js é utilizado. A versão estática chama métodos locais no Worker e acessa diretamente o PNCP.

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/schema` | Colunas, filtros disponíveis, ordenações e limites |
| POST | `/api/query` | Consulta de uma página |
| GET | `/api/pncp/filters` | Opções dos domínios de filtros |
| GET | `/api/pncp/suggest` | Sugestões para filtros de lista habilitados |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/itens` | Quantidade e página de itens |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/arquivos` | Arquivos da contratação e links de download |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/atas` | Atas de registro de preço vinculadas |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/contratos` | Contratos/empenhos vinculados |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/historico` | Eventos, documentos e justificativas |
| GET | `/api/atas/{cnpj}/{anoCompra}/{sequencialCompra}/{sequencialAta}` | Dados completos da ata |
| GET | `/api/atas/{cnpj}/{anoCompra}/{sequencialCompra}/{sequencialAta}/{recurso}` | Partes envolvidas, contratos, arquivos e histórico |
| GET | `/api/contratos/{cnpj}/{ano}/{sequencial}` | Dados completos do contrato |
| GET | `/api/contratos/{cnpj}/{ano}/{sequencial}/{recurso}` | Empenhos, instrumentos de cobrança, termos, arquivos e histórico |
| GET | `/api/contratos/{cnpj}/{ano}/{sequencial}/{recurso}/{sequencialRegistro}` | Detalhes de empenhos/instrumentos ou arquivos de termos |
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

Não é necessário preencher `PNCP_VALIDATED_FILTERS` para usar o catálogo. O [guia dos filtros](docs/viabilidade-filtros-pncp.md) registra a implementação e a evidência disponível. A homologação de todas as combinações na fonte real continua limitada pela disponibilidade do PNCP. Ao alterar o normativo legal, a interface confere os amparos selecionados e remove os incompatíveis antes de aplicar a pesquisa.

## Distribuir e publicar

A versão estática usa `npm run build:browser` e publica `dist-browser/`, conforme o [guia de hospedagem estática](docs/hospedagem-estatica.md). Antes de substituir uma implantação operacional, execute `pncp-diagnostic.html` no domínio HTTPS de destino e confira os navegadores utilizados. Consulte o [alcance dos testes](docs/validacao.md).

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
- [Viabilidade de execução no navegador sem backend próprio](docs/viabilidade-browser.md)
- [Plano de implementação da versão para navegador](docs/plano-implementacao-browser.md)
- [Configuração, rede e limites](docs/configuracao.md)
- [Contrato da API e consultas ao PNCP](docs/consultas-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Hospedagem estática sem backend](docs/hospedagem-estatica.md)
- [Publicação no Railway](docs/railway.md)

Os avisos de licença do Tabulator, de lossless-json e dos ícones usados na interface estão em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
