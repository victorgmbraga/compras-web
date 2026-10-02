# Correção da validação da busca PNCP

Data: 2 de outubro de 2026.

O erro “Busca PNCP retornou tamanho ou tipo de documento incompatível.” foi provocado pelo uso de `doc_type` como se representasse o tipo funcional solicitado em `tipos_documento`.

Uma consulta real retornou HTTP 200 com dez documentos e total 3467:

```json
{
  "doc_type": "_doc",
  "document_type": "edital"
}
```

Fonte: `https://pncp.gov.br/api/search/?tipos_documento=edital&status=todos&ordenacao=-data&pagina=1&tam_pagina=10&q=firewall`.

`doc_type` é metadado técnico do índice. `document_type` representa o tipo funcional. A comparação `_doc === edital` era falsa mesmo quando a resposta atendia corretamente à consulta. Os dez documentos recebidos respeitavam o tamanho solicitado; a falha era a segunda condição do `&&`.

## Alterações

- Em `src/pncp.js`, a quantidade recebida e o tipo funcional são conferidos separadamente. O tipo é comparado por `document_type`, com metadados no erro indicando o campo esperado e os tipos recebidos. Excesso de documentos continua sendo rejeitado.
- Em `src/adapter.js`, `tipo_documento` e o prefixo da identidade usam `document_type`. O registro original mantém `doc_type` intacto em `_raw`.
- Demonstração e fixtures de teste passaram a representar o esquema observado: `doc_type=_doc` e `document_type=edital`.
- Tipo funcional ausente, inválido ou diferente do solicitado continua sendo rejeitado; não existe fallback silencioso para `doc_type`.

A tabela da seção 3.1 da documentação fornecida atribuía `tipo_documento` a `doc_type`; o mapeamento correto na resposta real é `tipo_documento ← document_type`. O texto original foi preservado em `especificacao.md`, com referência a esta errata.

## Verificação

Os **44 testes automatizados passaram**, incluindo cinco regressões novas em `test/search-validation.test.js`:

1. Busca, refinamento e CSV aceitam `_doc` junto a `document_type=edital`.
2. Contrato retornado para uma busca de edital continua sendo rejeitado com diagnóstico específico.
3. Tipo funcional ausente, nulo, vazio, numérico, booleano ou estruturado é rejeitado.
4. Página com mais documentos que o tamanho solicitado continua sendo rejeitada.
5. Projeção e identidade usam o tipo funcional e distinguem documentos com o mesmo identificador em tipos diferentes.

O corpo da resposta real obtida via cURL também foi passado pelo cliente e pelo serviço corrigidos: dez linhas, `tipo_documento=edital` e identidades com prefixo `edital:`. A condição antiga foi reproduzida sobre essa mesma resposta e resultou em falso.

Uma tentativa adicional de buscar diretamente pelo cliente HTTP Node.js retornou HTTP 502 neste ambiente antes de qualquer validação do corpo. Assim, a verificação com dados reais comprova o formato e seu processamento, sem afirmar que essa conexão direta ou todos os filtros remotos foram certificados. Nenhum resultado real foi incluído no pacote; os testes persistidos usam dados sintéticos.
