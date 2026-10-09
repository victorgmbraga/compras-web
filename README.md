# Contratos Web

Pesquisa de editais e avisos de contratações, atas de registro de preços e contratos públicos nas APIs do Portal Nacional de Contratações Públicas (PNCP).

[Acessar a aplicação](https://contratos-web.net.br/) · [Repositório no GitHub](https://github.com/victorgmbraga/contratos-web)

A aplicação executa no navegador. Consultas, validação de filtros e geração de CSV usam um Web Worker; a hospedagem serve arquivos estáticos. O navegador precisa de acesso à internet e de respostas do PNCP com CORS válido.

## Usar a aplicação

1. Escolha **Editais e Avisos de Contratações**, **Atas de Registro de Preços** ou **Contratos**. Digite a busca e use o botão com ícone de lupa. Sem critérios na URL, a aplicação pesquisa contratações sem filtros.
2. Use o botão com ícone de filtro para editar os critérios e selecione **Aplicar e pesquisar**. As opções disponíveis dependem do tipo documental. A ordenação pode ser por publicação ou relevância; relevância exige texto.
3. Navegue pelos resultados, com 100 documentos por página. Novos critérios começam na página 1. **Atualizar** repete a última consulta concluída; **Tentar novamente** repete a página que falhou. **Cancelar** interrompe a consulta em andamento.
4. Clique em uma linha para abrir seus detalhes. O título do painel é o título da linha; **Abrir no PNCP** e **Sistema de origem**, quando disponíveis, ficam junto ao botão de fechar.
5. Use **Selecionar colunas** para ajustar a tabela. Colunas com filtro exibem um ícone após o nome; seu menu oferece as ações de filtro e ordenação disponíveis.
6. Use **Exportar CSV** para coletar todos os documentos dos últimos critérios concluídos, desde a primeira página. O arquivo inclui todas as colunas do tipo documental. A coleta mostra progresso e pode ser interrompida com **Cancelar CSV**.

O ícone do GitHub, à direita da paginação, abre o repositório em nova aba.

### Detalhes dos documentos

| Tipo | Abas |
| --- | --- |
| Edital/aviso | Detalhes, Itens, Arquivos, Atas de Registro de Preço, Contratos/Empenhos, Histórico |
| Ata | Detalhes, Partes envolvidas, Contratos, Arquivos, Histórico |
| Contrato | Detalhes, Empenhos, Instrumentos de cobrança, Termos, Arquivos, Histórico |

Ao abrir o painel, os dados completos de atas/contratos e a primeira página de cada listagem carregam em segundo plano. As abas exibem contadores; cada listagem tem paginação e tratamento de falhas próprios. Arquivos de termos e detalhes de empenhos/instrumentos de cobrança carregam ao selecionar o registro.

Quando o PNCP informa uma contagem incompatível com os eventos do histórico de um contrato, a aba mostra **Histórico (?)** e **Quantidade desconhecida**. É possível tentar a próxima página até encontrar uma página vazia. HTTP 404 significa lista vazia em **Contratos/Empenhos** de uma contratação e nas listas **Empenhos** e **Instrumentos de cobrança** de um contrato. As demais regras estão no [guia de consultas](docs/consultas-pncp.md).

### Filtros, cache e limites

O catálogo contém 80 filtros: 71 aplicáveis a contratações, 16 a atas e 32 a contratos. Há filtros compartilhados entre tipos. Órgãos, unidades e fornecedores usam os IDs fornecidos pelo PNCP. Informação ausente é distinta de **Não**, zero ou lista vazia.

As opções dos três tipos são carregadas na inicialização e armazenadas no `localStorage` por quatro horas. Listas grandes são compactadas; se o armazenamento estiver indisponível, o cache funciona em memória. Amparos dependentes de normativos carregam sob demanda. Sugestões por texto e consultas de documentos acessam novamente a fonte.

A tabela mantém a ordem, os resultados e o total do PNCP. A janela de navegação alcança até 10.000 documentos; refine a pesquisa para acessar conjuntos maiores. O CSV exige que o total caiba no limite de exportação configurado. Filtros de itens selecionam contratações, enquanto os detalhes exibem todos os itens. Os dados podem mudar entre consultas.

## Compartilhar uma busca

Copie a URL da barra de endereços depois de pesquisar, aplicar filtros ou mudar de página. O link contém busca, filtros aplicados, tipo documental, ordenação e página. Abrir o link, recarregar ou usar **Voltar/Avançar** restaura esses critérios.

```text
https://contratos-web.net.br/?tipos_documento=contrato&q=reforma&status=vigente&ordenacao=-data&pagina=2&possui_nfe=false
```

Os parâmetros usam os nomes do PNCP. Listas usam `|` codificado como `%7C`, por exemplo `ufs=SP%7CDF`; booleanos usam `true`/`false`. Alterações no painel de filtros só entram na URL ao aplicar. Um link inválido exibe um aviso e permite corrigir ou limpar os critérios. Veja o [formato completo dos parâmetros](docs/consultas-pncp.md#url-compartilhável-da-interface).

## Executar localmente

Na raiz do repositório, use **Node.js 22.12 ou superior** e npm. O workflow de publicação usa Node.js 24.

```sh
npm ci
npm run dev
```

Abra `http://localhost:8000`. Para usar dados fictícios, execute `npm run demo` ou acrescente `?demo=1` à URL. A demonstração contém 64 contratações, 24 atas e 32 contratos e identifica sua fonte na interface.

| Comando | Finalidade |
| --- | --- |
| `npm start` ou `npm run dev` | Desenvolvimento com Vite e recarga automática |
| `npm run demo` | Desenvolvimento com dados fictícios |
| `npm test` | Testes do núcleo, filtros, interface e comunicação com o Worker |
| `npm run test:browser` | Testes de interface, cache, layout, CORS, artefato e CSV em navegador |
| `npm run build` | Gera a distribuição estática em `dist-browser/` |
| `npm run preview` | Serve o build em `http://localhost:8000` |

Os testes de navegador precisam de um navegador instalado pelo Playwright ou de um executável configurado. Consulte [Testes e validação](docs/validacao.md).

## Configurar e publicar

A configuração pública fica em [`public/browser-config.json`](public/browser-config.json); `{}` usa os padrões. As opções e os limites estão em [Configuração](docs/configuracao.md).

Execute `npm run build` e publique o conteúdo de `dist-browser/` por HTTPS. Os caminhos relativos permitem publicar na raiz ou em um subdiretório, como `/contratos-web/`. Node.js é necessário para as ferramentas de desenvolvimento e build; o artefato publicado executa no navegador.

O [workflow do GitHub Pages](.github/workflows/static-pages.yml) executa testes, gera o build e publica cada commit enviado à `main`, com opção de execução manual. O [guia de hospedagem](docs/hospedagem-estatica.md) descreve a configuração do Pages, cabeçalhos, atualização e diagnóstico do acesso ao PNCP.

## Documentação

- [Arquitetura e organização do código](docs/arquitetura.md)
- [Configuração, rede e limites](docs/configuracao.md)
- [Serviço do navegador, filtros e consultas ao PNCP](docs/consultas-pncp.md)
- [Testes e validação](docs/validacao.md)
- [Hospedagem estática](docs/hospedagem-estatica.md)

As licenças das dependências e dos ícones estão em [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
