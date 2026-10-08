# Compras Web

Aplicação para pesquisar editais e avisos de contratações, atas de registro de preços e contratos públicos diretamente nas APIs do Portal Nacional de Contratações Públicas (PNCP). A distribuição estática executa consultas, filtros e geração de CSV no navegador, em um Web Worker. A hospedagem entrega somente arquivos; não precisa executar Node.js, API própria ou proxy.

Texto, filtros, ordenação e paginação são enviados ao PNCP. Cada pesquisa consulta novamente a fonte. Os resultados ficam em memória durante o uso; a aplicação não requer banco de dados nem volume persistente.

## Executar no navegador

Para desenvolver e gerar os arquivos, requer **Node.js 22.12 ou superior**, com Node.js 24 recomendado, e npm. Depois do build, a hospedagem precisa apenas servir arquivos por HTTPS. Cada navegador acessa `pncp.gov.br` diretamente, sem credenciais.

```sh
npm ci
npm run dev
```

Abra `http://localhost:8000`. Para usar dados fictícios explicitamente:

```sh
npm run demo
```

A demonstração identifica sua fonte e contém 64 contratações, 24 atas e 32 contratos, incluindo itens e listagens relacionadas. Ela também pode ser escolhida com `?demo=1` na URL da versão estática. Falhas de acesso ao PNCP nunca ativam a demonstração automaticamente.

Para gerar e verificar a distribuição:

```sh
npm run build
npm run preview
```

Publique **o conteúdo de `dist-browser/`** em uma hospedagem estática. Funciona na raiz e em `/compras-web/`, com assets locais. Não abra o HTML por `file://`. A configuração pública está em [`public/browser-config.json`](public/browser-config.json); consulte [Configuração](docs/configuracao.md) e [Hospedagem estática](docs/hospedagem-estatica.md).

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
| `npm start` ou `npm run dev` | Desenvolvimento com Vite e recarga automática |
| `npm run demo` | Desenvolvimento com fonte fictícia |
| `npm run build` | Compila aplicação e Worker em `dist-browser/` |
| `npm run preview` | Serve o artefato estático para verificação local |
| `npm test` | Testa núcleo, filtros, interface e comunicação com o Worker |
| `npm run test:browser` | Testa layout, CORS, artefato estático e CSV de 10.000 documentos |

Node.js é usado apenas nessas ferramentas. A aplicação publicada executa no navegador; não há servidor da aplicação, API própria ou dependências a instalar na hospedagem. As tarefas do editor Zed estão em [`.zed/tasks.json`](.zed/tasks.json).

## Distribuir e publicar

Execute `npm run build` e publique **o conteúdo de `dist-browser/`** por HTTPS. O [guia de hospedagem estática](docs/hospedagem-estatica.md) descreve GitHub Pages, Cloudflare Pages, cabeçalhos e atualização dos arquivos. O workflow de GitHub Pages publica automaticamente cada commit na `main` e também pode ser executado manualmente.

A configuração pública é `browser-config.json`. Cada navegador precisa acessar diretamente o PNCP com CORS válido. Use `pncp-diagnostic.html` no domínio publicado para verificar essa integração. O [guia de validação](docs/validacao.md) distingue os testes sintéticos das medições reais.

## Documentação

- [Arquitetura e organização do código](docs/arquitetura.md)
- [Execução no navegador e alcance da homologação](docs/viabilidade-browser.md)
- [Implementação e verificações para publicação](docs/plano-implementacao-browser.md)
- [Configuração, rede e limites](docs/configuracao.md)
- [Serviço do navegador, filtros e consultas ao PNCP](docs/consultas-pncp.md)
- [Implementação e verificação dos filtros](docs/viabilidade-filtros-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Hospedagem estática](docs/hospedagem-estatica.md)

Os avisos de licença do Tabulator, de lossless-json e dos ícones usados na interface estão em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
