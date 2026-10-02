# Compras Web — Node.js e Tabulator

Implementação da especificação 2.0.0 fornecida, com backend Node.js e frontend Tabulator 6.3.1. Não depende de banco, importação, índices locais ou armazenamento de contratações no navegador.

**Versão 2.0.3 — tabela e detalhes:** Título é a primeira coluna padrão; Município fica visível por padrão. Abrir uma contratação consulta os itens automaticamente. Links da busca em `/compras/` passam a abrir `/app/editais/` no portal. Veja [as alterações](docs/alteracoes-interface-2.0.3.md).

**Revisão anterior 2.0.2 — consultas prontas:** a seleção de consultas especializadas abre a preparação dos filtros antes da busca. Erros de limite mostram contagens e a ação **Delimitar pesquisa**. **60 testes passaram**. Veja [a correção e as instruções de uso](docs/correcao-consultas-prontas.md).

**Revisão anterior 2.0.1:** corrige domínios de anos, links `/compras/`, situação dos itens, cobertura de dados insuficientes, datas precisas, atualização da página, recuperação de sugestões/detalhes e concorrência do CSV. **54 testes passaram**, além de 11 verificações HTTP locais com respostas oficiais capturadas. Veja [a auditoria e seu alcance](docs/auditoria-integracao-pncp.md). Ao atualizar, preserve sua `.env`.

**Correção de integração (02/10/2026):** o tipo funcional retornado pela busca vem em `document_type` (`edital`), enquanto `doc_type` contém o metadado técnico `_doc`. A validação, a coluna `tipo_documento` e a identidade dos documentos foram corrigidas. Consulte [o diagnóstico e os testes](docs/correcao-validacao-pncp.md).

## Executar

Requer **Node.js 22.9 ou superior**. Node.js 24 foi usado na validação.

```sh
npm ci
npm start
```

Abra **http://localhost:8000**. `npm start` lê `.env`, quando presente. Para alterar configurações, copie `.env.example` para `.env` e ajuste os valores. Os assets do Tabulator são servidos pela própria aplicação; não dependem de CDN.

Para experimentar a interface com **dados sintéticos identificados visualmente**:

```sh
npm run demo
```

O modo padrão consulta o PNCP. Falhas remotas geram erro, sem fallback automático para a demonstração. O modo de demonstração oferece busca textual simplificada e não reproduz a linguagem completa de busca do PNCP.

```sh
npm test
npm run build
```

O build cria uma distribuição em `dist/`. Não é necessário para rodar o projeto original. Em `dist/`, execute `npm ci --omit=dev` e `npm start`.

## Utilização

- A tabela ocupa a altura restante da janela, com cabeçalho e controles compactos. Use **Expandir tabela** para dedicar quase toda a tela aos resultados; **Restaurar layout** ou **Esc** retorna à busca. As linhas mostram até duas linhas do objeto; os detalhes exibem o texto completo.
- Pesquise um termo para consultar o PNCP. A busca textual alcança os campos indexados pelo portal e não é um filtro exclusivo do objeto.
- Abra **Filtros** para escolher domínios, datas, valores, regras textuais e ordenações. Órgãos, unidades e municípios usam opções e IDs recebidos do PNCP. Autocomplete usa três caracteres, debounce de 450 ms e cancelamento.
- O menu de cada coluna oferece seus filtros tipados e ordenação. Regex, regras adicionais, categorias, agrupamento e ordenações sem equivalente remoto ativam refinamento.
- Os presets especializados verificam que **um mesmo item** é serviço e está em andamento ou homologado. Não inserem um `q` aproximado oculto. Delimite o conjunto com datas, UF ou órgão.
- Clique em uma linha para abrir detalhes e carregar os itens. A quantidade informada pelo PNCP aparece no título, no intervalo de itens e na paginação própria. A última página mantém seus itens visíveis e desabilita **Próxima**. **Atualizar itens** consulta novamente a quantidade e a página atual.
- **Exportar CSV** refaz a consulta completa com os critérios da última pesquisa concluída. Os dados podem diferir da tabela. Casos indeterminados exigem a opção explícita de exportar apenas confirmados.
- **Atualizar resultados** repete os critérios. **Cancelar** interrompe as chamadas futuras. Depois de uma falha, a tabela anterior fica identificada e a exportação permanece desabilitada até uma pesquisa bem-sucedida.

## Arquitetura

| Arquivo | Responsabilidade |
| --- | --- |
| `src/server.js` | Servidor HTTP Node.js, interface, rotas, cancelamento e limites locais |
| `src/config.js` | Configurações e validação de inicialização |
| `src/pncp.js` | Cliente HTTPS, proxy de ambiente, timeouts, tentativas, limites e paginação de itens |
| `src/schema.js` | Colunas tipadas, presets, limites e registro dos 87 argumentos |
| `src/validation.js` | Validação estrita e contratos de consulta |
| `src/adapter.js` | Projeção, identificação, decimais exatos e links |
| `src/query.js` | Consultas nativas/refinadas, verificação, cobertura e CSV |
| `src/rules.js` | Presets, filtros, categorias, comparação e agrupamento |
| `src/worker.js`, `src/rules-worker.js` | Regras isoladas em worker cancelável e com timeout |
| `src/business-data.json` | Anexos A, B e C extraídos da especificação, sem alteração de termos |
| `src/casefold.json` | Diferenças do casefold Unicode em relação ao lowercase |
| `src/demo.js` | Dados e cliente HTTP sintéticos para demonstração explícita |
| `public/` | Interface, Tabulator, filtros, detalhes, seleção de colunas e exportação |
| `test/` | Testes com cliente substituível e respostas JSON pequenas |
| `docs/especificacao.md` | Documento de entrada preservado |

As dependências de runtime são Tabulator, `lossless-json` e Undici. O servidor usa `node:http`; não há framework nem processo de compilação obrigatório.

## API local

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/schema` | Esquema, capacidades, presets e limites; funciona sem PNCP |
| POST | `/api/query` | Consulta nativa ou refinada |
| GET | `/api/pncp/filters?tipos_documento=edital` | Domínios; aceita `normativos_base=ID\|ID` |
| GET | `/api/pncp/suggest` | Aceita `tipos_documento`, `campo`, `q` e `tam_pagina` |
| GET | `/api/contratacoes/{cnpj}/{ano}/{sequencial}/itens` | Aceita `pagina` e `tamanhoPagina` |
| POST | `/api/export` | Recebe `{query, scope}` e devolve CSV após coleta completa |
| GET | `/api/health` | Processo e metadados da última chamada; não garante disponibilidade contínua |

Nos detalhes, a rota de itens consulta `/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/quantidade` no PNCP a cada leitura e retorna `total_items`, `total_pages` e `has_more`. O total determina a última página, inclusive quando ela contém exatamente 100 itens. Uma divergência entre a quantidade e a página recebida exige atualizar a consulta; não garante um snapshot. A coleta integral usada pelos presets continua verificando todas as páginas até uma resposta vazia, sem presumir conclusão a partir de uma página curta.

Exemplo:

```sh
curl http://localhost:8000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"api_version":"2.0","mode":"native","preset":"all","document_type":"edital","q":"firewall","status":"todos","pncp_filters":{"ufs":["DF"]},"order":"-data","page":1,"size":50}'
```

Todos os dados usam `Cache-Control: no-store`. `/imports` e `/api/imports/*` retornam 410. A aplicação não mantém históricos de payloads nem usa localStorage, IndexedDB ou service worker para os resultados.

## Contagens e consistência

No modo nativo, o total da fonte é separado da janela acessível de 10000 documentos. No modo refinado, todas as páginas do conjunto de até 500 candidatos são coletadas e conferidas antes de filtrar e paginar. Cada nova página refinada repete a coleta.

Mudanças de total, identidades duplicadas e páginas incompletas abortam com `SOURCE_CHANGED`. `collection_complete=true` significa conclusão da coleta delimitada; `snapshot_guaranteed` permanece false. `unverifiable_documents` contabiliza a ausência real de informações necessárias. Falhas HTTP de detalhes interrompem a operação.

Decimais monetários são projetados como strings sem perda de precisão de parsing. Os códigos continuam strings. Datas sem fuso são exibidas pela data literal; não se atribui timezone silenciosamente. Ordenações refinadas recusam misturar datas com e sem fuso sem convenção explícita. Nulos ficam no fim em ambos os sentidos.

O CSV inclui todas as 23 colunas documentais registradas, UTF-8 com BOM, vírgula e escape de aspas/quebras. É gerado integralmente em memória, somente depois de concluir a coleta. Cabeçalhos informam intervalo, quantidade, cobertura e ausência de garantia de snapshot.

## Capacidades e pendências concretas

**Integração real:** em 02/10/2026 foram obtidas respostas HTTP 200 de busca, filtros, sugestões e itens via cURL. Seus corpos originais passaram por 11 verificações na API HTTP local, incluindo refinamento e CSV de um conjunto completo de dois documentos. A conexão direta do cliente Node.js apresentou timeout neste ambiente; rodadas anteriores também retornaram HTTP 502. Consulte [a auditoria](docs/auditoria-integracao-pncp.md) para os parâmetros, evidências e limites desses ensaios.

O registro contém os **87 argumentos** do anexo C. Os sete controles são reservados ao adaptador. Os filtros básicos de UF, órgão, unidade, município, esfera, poder, modalidade, situação, ano, publicação e valores foram habilitados com base nos exemplos da documentação fornecida. `/api/schema` registra essa evidência documental; os ensaios da auditoria são parciais e não certificam individualmente todos os argumentos. Os demais ficam `pending_validation` e são rejeitados com erro explícito. Domínios pequenos são conferidos em `/filters` durante a operação; domínios extensos podem ser parciais e a interface usa sugestões. Anos incompatíveis com AAAA são omitidos das opções com aviso, preservando o registro original.

Para habilitar um argumento adicional após ensaio real, registre seu nome em `PNCP_VALIDATED_FILTERS`, separado por vírgula. Verifique não só HTTP 200, mas domínio, formato e efeito da restrição. Filtros de outros tipos de documento continuam indisponíveis, pois só `edital` tem projeção implementada. `-data`, `data` e relevância com texto são as ordenações remotas habilitadas.

**Desenvolvimento e Infraestrutura:** os códigos históricos foram preservados. Os dois presets só ficam disponíveis depois de configurar `PNCP_PRESET_CATALOG_ID` com o ID de um catálogo oficialmente verificado. Não há associação presumida. O sufixo histórico `.0` é retirado somente dos códigos de configuração; códigos recebidos do PNCP são comparados exatamente dentro do catálogo.

Restrições candidatas dos presets não são ativadas como otimizações sem ensaio real. Use `PNCP_VALIDATED_PRESET_OPTIMIZATIONS` somente para restrições verificadas e já habilitadas. A verificação final permanece em todos os casos.

**Regex:** usa busca ECMAScript `/iu` em worker isolado, com orçamento de 1500 ms e limite de memória. `\\w`, `\\d` e fronteiras são adaptados para Unicode. Não é uma engine Python completa. Inline flags, grupos Python, backreferences, lookbehind, escapes exclusivos de Python e determinadas diferenças de IGNORECASE com I pontuado/sem ponto são explicitamente não suportados. Padrões reconhecidos como incompatíveis são rejeitados; regex custosa expira sem bloquear o servidor. Filtros literais usam casefold Unicode sem remover acentos; categorias têm a normalização específica do anexo B.

Detalhes de itens requerem CNPJ, ano e sequencial originais, sem inventar identificadores a partir do objeto ou usar ID do órgão como CNPJ. Ausência dessa identificação conta como não verificável nos presets. O endpoint real de itens usa `situacaoCompraItem`; o alias `situacaoCompraItemId` do manual também é aceito, com rejeição de conflitos. Arrays de itens e JSON de busca têm validação de formato.

## Implantação Node.js

Para publicar no **Railway**, use a configuração [`.railway/railway.ts`](.railway/railway.ts) e siga o [guia de deploy](docs/railway.md), com comandos de publicação, variáveis e verificação do serviço.

Execute em um serviço que mantenha um processo Node.js, com HTTPS na entrada e saída permitida para `pncp.gov.br`. Configure `HOST=0.0.0.0` e a `PORT` fornecida pela hospedagem. Há um Dockerfile:

```sh
docker build -t compras-web-pncp .
docker run --rm -p 8000:8000 --env-file .env compras-web-pncp
```

Se passar `.env` ao contêiner, ajuste nela `HOST=0.0.0.0`; ela prevalece sobre o valor do Dockerfile. O frontend e o backend são servidos pela mesma origem. Não há autenticação própria nesta versão.

Comece com **um processo**. Os limites de duas chamadas simultâneas e duas chamadas por segundo são por processo. Para vários processos/instâncias, distribua esses limites externamente; esta versão não implementa um coordenador compartilhado. Memória operacional de 100 MiB de payload não inclui toda a sobrecarga de objetos, buffers e workers; dimensione o processo com folga. Logs incluem metadados, status, latência e request_id, sem registrar objetos de contratações.

Os scripts e o Dockerfile limitam o heap principal a 512 MiB. Cada worker de regras tem limite próprio de 128 MiB. Esses valores não representam um teto absoluto de RSS; configure também o limite de memória do serviço ou contêiner conforme o volume e a concorrência.

O relatório dos testes e da conferência da interface está em `docs/validacao.md`. Para medir somente o processamento local com fonte sintética, use `npm run benchmark:demo`. Para testes adicionais de UI, instale Playwright e Chromium e execute `node test/ui-smoke.mjs`; esses pacotes não são dependências da aplicação.

## Licenças e fontes

A licença MIT do Tabulator está em `THIRD_PARTY_LICENSES.md`. As dependências também mantêm seus próprios arquivos de licença no pacote instalado.

- [Tabulator](https://www.tabulator.info/)
- [Paginação remota Tabulator](https://www.tabulator.info/docs/6.3/page)
- [Busca PNCP](https://pncp.gov.br/api/search/)
- [Consulta de itens — manual PNCP](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html)

### Consultas prontas: preparação da pesquisa (2.0.2)

Ao selecionar uma consulta especializada, a interface abre os filtros antes de executá-la. Informe texto, período de publicação, UF ou órgão e clique em **Aplicar e pesquisar**. O limite padrão é de 500 candidatos do PNCP, antes da verificação dos padrões do objeto e dos itens. A mensagem `QUERY_TOO_BROAD` mostra o total e o limite e oferece **Delimitar pesquisa**. As consultas nativas continuam diretas. Cancelar a preparação mantém a consulta anterior. Nenhum texto ou período é inserido automaticamente; critérios de busca textual escolhidos por você delimitam o escopo e podem excluir outras grafias previstas na regra especializada. Veja [a correção detalhada](docs/correcao-consultas-prontas.md).
