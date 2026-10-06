> Referência histórica. Desde 06/10/2026, a aplicação usa somente consultas diretas ao PNCP; consultas prontas e refinamento local foram removidos. O comportamento atual está em [consultas-pncp.md](consultas-pncp.md).

# Consultas prontas — correção 2.0.2

Data: 02/10/2026. Mensagem relatada: `Delimite datas, UF ou órgão para consultar integralmente os resultados. [QUERY_TOO_BROAD]`.

## Causa

As consultas especializadas, como Oracle e Microsoft, precisam coletar os candidatos antes de verificar os padrões do objeto e os itens de cada contratação. O limite padrão dessa coleta é **500 documentos**, configurado em `PNCP_MAX_REFINEMENT_CANDIDATES`. O limite é aplicado ao total retornado pela busca remota, antes das regras locais.

A seleção de uma consulta pronta iniciava imediatamente a coleta. Sem texto ou filtros nativos suficientes, ela consultava um conjunto amplo do PNCP e recebia `QUERY_TOO_BROAD`. A seleção de Oracle, por exemplo, não acrescenta automaticamente `q=oracle`: a regra também reconhece outras grafias, como MySQL e Exadata. Uma busca textual implícita poderia excluir documentos válidos.

O backend continua impedindo a coleta acima do limite. Remover essa proteção ou filtrar somente a primeira página poderia apresentar resultados incompletos como se fossem integrais.

## Correções

- Selecionar uma consulta especializada abre a preparação dos filtros, sem iniciar a busca.
- O diálogo identifica a consulta e informa o limite antes da verificação das regras e itens.
- Texto e período de publicação podem ser preenchidos diretamente, junto dos demais filtros nativos.
- Texto e filtros nativos existentes são preservados. Nenhum texto ou período é aplicado automaticamente.
- A consulta selecionada permanece em um rascunho até **Aplicar e pesquisar**. Cancelar preserva a consulta anterior.
- A mensagem de busca ampla mostra o total de candidatos e o limite configurado. O botão **Delimitar pesquisa** reabre os critérios da tentativa que falhou; a mensagem também esclarece que regras adicionais não reduzem o total da coleta.
- Consultas nativas continuam sendo executadas diretamente.

## Como utilizar

1. Abra **Consultas prontas** e escolha a consulta especializada.
2. Informe um período de publicação, uma UF ou um órgão. Você também pode delimitar pelo campo de texto, sabendo que isso restringe o escopo da busca em vários campos indexados do PNCP.
3. Clique em **Aplicar e pesquisar**.
4. Se o conjunto continuar maior que o limite, clique em **Delimitar pesquisa** e reduza o período ou combine outros filtros nativos.

Adicionar uma regra local do tipo “objeto contém Oracle” não resolve o excesso de candidatos: ela é avaliada depois da coleta. Escolher explicitamente o texto “Oracle” no campo de busca restringe o escopo e pode excluir outras grafias previstas na consulta especializada. Não há truncamento silencioso.

## Verificação

**60 testes automatizados passaram**, incluindo seis regressões novas:

| Teste | Verificação |
| --- | --- |
| PRESET-FLOW-01 | Seleção abre a preparação sem consultar; cancelar mantém a consulta anterior. |
| PRESET-FLOW-02 | Texto e datas explícitos chegam ao serviço e reduzem o conjunto antes da verificação dos itens. |
| PRESET-FLOW-03 | A busca ampla informa contagens; a ação de correção preserva Oracle e uma nova tentativa delimitada conclui. |
| PRESET-FLOW-04 | Consulta nativa permanece direta; retirar uma data remove o filtro enviado. |
| PRESET-FLOW-05 | Excesso de candidatos aborta após a primeira busca, sem carregar itens, inserir texto oculto ou truncar resultados. |
| PRESET-FLOW-06 | Seleção preserva texto e filtros nativos existentes; cancelar descarta alterações do rascunho. |

Os testes do fluxo executam o código real de `public/app.js` com um DOM mínimo e um adaptador de Tabulator, ligados ao serviço de consulta com respostas sintéticas. Não verificam renderização em navegador nem disponibilidade ao vivo do PNCP. A auditoria e as capturas da versão 2.0.1 permanecem como evidências daquela revisão.

## Atualização

Substitua os arquivos pela versão 2.0.2 preservando sua `.env`. Execute `npm ci`, `npm test` e reinicie com `npm start`. O contrato HTTP permanece na versão 2.0; não há migração de banco. O limite padrão permanece em 500 candidatos.
