# Testes e validação

Execute os comandos na raiz com Node.js 22.12 ou superior e dependências instaladas por `npm ci`. As versões das ferramentas estão em [`package.json`](../package.json) e [`package-lock.json`](../package-lock.json).

## Núcleo e interface

```sh
npm test
```

O runner nativo executa `test/*.test.js` em sequência. A suíte cobre:

- Critérios, tipos documentais, os 80 filtros, domínios, formatos, intervalos, precisão decimal e identificadores.
- Pesquisa, paginação, ordenações compatíveis por tipo, projeção de dados, identidades e detalhes dos três tipos.
- HTTP 204/404 nos recursos permitidos, histórico de contrato com total desconhecido, falhas de formato, transporte e contagem.
- CSV, consistência entre páginas, limites de bytes/documentos, progresso e cancelamento.
- Configuração pública, fila, tentativas, prazo de operação e comunicação com o Worker.
- URL compartilhável, restauração dos controles e da página, Voltar/Avançar e descarte de respostas atrasadas.
- Pré-carga das opções, validade de quatro horas, compactação, armazenamento indisponível, deduplicação e amparos por normativo.

[`test/interface.test.js`](../test/interface.test.js) usa um DOM mínimo e o serviço tipado para verificar os fluxos da interface. Os testes usam fontes controladas; a renderização é verificada no navegador.

## Navegador e artefato estático

Instale o Chromium usado pelo Playwright:

```sh
npx playwright install chromium
npm run test:browser
```

O sistema precisa das bibliotecas exigidas pelo navegador. Quando necessário, a instalação do Playwright aceita `--with-deps`. Para usar Firefox:

```sh
npx playwright install firefox
COMPRAS_QA_BROWSER=firefox npm run test:browser
```

O comando [`test/browser-smoke.mjs`](../test/browser-smoke.mjs) executa as seguintes etapas:

| Etapa | Cobertura |
| --- | --- |
| Build de testes | `dist-browser-test/` com fonte controlada no Worker |
| Interface | Filtros, três tipos, links de busca, histórico do navegador, paginação, painéis, CSV, cancelamento, teclado e responsividade |
| Cache no navegador | Quota real de `localStorage`, compactação, reutilização após reinicialização e expiração |
| Build de produção | `dist-browser/`, assets e Worker na raiz e em subdiretório |
| Layout | Cores, fontes, espaçamentos e bordas comparados com [`test/layout-baseline.json`](../test/layout-baseline.json), em 1440, 1068 e 390 pixels |
| CORS controlado | Duas origens locais, permissão e bloqueio de leitura, exposição de `Retry-After` |
| Exportação | 10.000 documentos sintéticos, resposta da interface durante a coleta, cancelamento e reutilização do Worker |
| Bundles | Ausência de dependências de Node, variáveis do processo e fixtures de teste em produção |

Esses ensaios servem arquivos estáticos e verificam a ausência de chamadas a uma API da hospedagem. A fonte de grande volume e os casos de falha são sintéticos. O teste de CORS usa requisições entre origens locais; a integração com o PNCP é verificada separadamente.

### Opções do runner

| Variável | Uso |
| --- | --- |
| `COMPRAS_QA_BROWSER` | `chromium` (padrão), `firefox` ou `webkit` |
| `COMPRAS_QA_BROWSER_EXECUTABLE` | Caminho de um navegador instalado no ambiente |
| `COMPRAS_QA_CHROMIUM_EXECUTABLE` | Caminho alternativo de executável, usado quando a opção geral não está definida |
| `COMPRAS_QA_CHROMIUM_MODULE` | Módulo que fornece um executável Chromium |
| `COMPRAS_QA_PLAYWRIGHT_MODULE` | Módulo Playwright fornecido pelo ambiente |
| `COMPRAS_QA_SCREENSHOT_DIR` | Diretório existente para as capturas da interface |

Preserve o proxy e a confiança TLS exigidos pelo ambiente de execução. Um resultado só é aprovado quando o comando termina com código zero. Os resultados e tempos devem ser obtidos da execução em análise.

## Verificação manual

```sh
npm run build
npm run preview
```

Abra `http://localhost:8000/?demo=1`. Confira a troca dos três tipos, aplicação de filtros, compartilhamento/recarregamento da URL, detalhes, paginação e CSV. O ícone do GitHub deve ficar no canto superior direito, permanecer visível durante a rolagem horizontal do cabeçalho e abrir o repositório em nova aba.

A demonstração contém 64 contratações, 24 atas e 32 contratos. Todos os filtros têm simulação, mas os status de vigência usam a data fixa `2026-10-07`; a simulação de relevância e recebimento de propostas não reproduz integralmente a fonte. Os links dos registros fictícios são ilustrativos.

## Diagnóstico do PNCP

Abra [`pncp-diagnostic.html`](../public/pncp-diagnostic.html) servido pelo mesmo domínio HTTPS da aplicação. **Verificar acesso** consulta diretamente o PNCP na página e no Worker. **Cancelar** interrompe a verificação; **Salvar evidência** baixa um JSON com origem, data, navegador, status/cabeçalhos legíveis e resultado das operações.

O diagnóstico cobre buscas dos três tipos, paginação, ordenação/UF, filtros, sugestões, catálogos, detalhes e registros filhos. Usa documentos públicos definidos em [`public/pncp-diagnostic.js`](../public/pncp-diagnostic.js); quando disponíveis, escolhe os filhos retornados pelas listagens.

Uma resposta vazia ou HTTP 404 não comprova a consulta de um registro existente. O significado de 404 depende do recurso, conforme [Consultas ao PNCP](consultas-pncp.md). CORS, TLS e falhas de rede podem impedir que o JavaScript leia o status HTTP.

Verifique a aplicação nos navegadores e dispositivos usados pelo público, incluindo retomada de uma aba suspensa. Testes com dados sintéticos, viewport móvel ou WebKit automatizado não substituem consultas reais, dispositivo móvel ou Safari. Desempenho e acesso ao PNCP dependem da origem, da rede, do navegador e dos limites configurados.
