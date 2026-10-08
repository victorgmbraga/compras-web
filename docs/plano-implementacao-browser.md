# Implementação do navegador e verificações para publicação

O projeto usa exclusivamente a aplicação estática. `npm run build` compila a interface e o Web Worker em `dist-browser/`; a hospedagem entrega arquivos e o navegador consulta diretamente o PNCP.

## Implementação concluída

| Área | Resultado |
| --- | --- |
| Núcleo | Configuração pública, validação de critérios/identidades, esquema, projeções e precisão em módulos compatíveis com o navegador |
| Distribuição | Aplicação, diagnóstico, bibliotecas locais, Worker ES module, assets com hash e caminhos relativos para raiz/subdiretório |
| Transporte | Fetch nativo com CORS, sem credenciais e sem seguir redirecionamentos; fila, ritmo, tentativas e orçamentos por aba |
| Comunicação | Protocolo versionado por operação, progresso, cancelamento, descarte de respostas antigas e recuperação de falha do Worker |
| Interface | Pesquisa e filtros dos três tipos, painéis próprios, abas com contadores, paginação, teclado e responsividade |
| CSV | Coleta consistente por páginas, lotes de 25 documentos, buffers transferíveis e metadados compactos; download somente após conclusão |
| Ferramentas | Comandos de desenvolvimento, demonstração, build, preview e testes direcionados à aplicação estática |
| Publicação | Workflow automático de GitHub Pages em commits na `main`, execução manual e instruções de hospedagem, configuração e diagnóstico |

Os [testes](validacao.md) cobrem o núcleo, RPC, interface, layout e artefato final. A evidência direta de acesso ao PNCP está em [`evidencias-browser-implementacao.json`](evidencias-browser-implementacao.json). Consulte [Arquitetura](arquitetura.md) para os módulos e o fluxo vigente.

## Semântica preservada

- Cada pesquisa consulta novamente a fonte; o total é o informado pelo PNCP e a janela acessível tem até 10.000 documentos.
- Informação ausente, `false`, zero e erro permanecem distintos. HTTP 404 equivale a zero somente nas listas de contratos vinculados a uma contratação e nas listas de empenhos e instrumentos de cobrança de um contrato; não nos detalhes de registros individuais.
- Filtros de itens/resultados selecionam documentos, enquanto os detalhes exibem todos os registros disponíveis.
- Pesquisa, detalhes e CSV compartilham a fila por aba. Cancelar ou fechar um painel interrompe suas operações; respostas antigas são descartadas.
- CSV usa os últimos critérios concluídos, verifica total, quantidade e identidade em cada página e não garante snapshot da fonte.
- A demonstração é escolhida explicitamente; uma falha real nunca a ativa automaticamente.

## Verificações operacionais pendentes

1. Definir a hospedagem estática HTTPS e publicar o conteúdo completo de `dist-browser/`, com MIME e cabeçalhos apropriados.
2. Executar `pncp-diagnostic.html` na origem publicada em Chromium, Firefox e Safari usados pelo público. Registrar respostas positivas dos recursos necessários; uma amostra com HTTP 404 não homologa registros existentes desse recurso.
3. Conferir dispositivo móvel real, suspensão/retomada de aba, cancelamento e exportação com os limites de produção. Viewports móveis e fontes sintéticas não substituem esses ensaios.
4. Validar atualização conjunta de HTML, configuração e bundles, abertura de uma nova aba e recuperação de um artefato estático aprovado.

A homologação local comprova os fluxos testados e o acesso observado ao PNCP naquela origem/data. A disponibilidade, CORS da origem publicada e desempenho de consultas reais precisam ser verificados no destino, conforme [Hospedagem estática](hospedagem-estatica.md).
