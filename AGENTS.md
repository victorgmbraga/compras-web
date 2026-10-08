# Instruções para agentes

## Validação, commit e push

Ao concluir cada alteração solicitada, execute as verificações pertinentes ao seu alcance. Depois de validar a alteração, crie um commit com uma mensagem descritiva e faça push automaticamente, sem solicitar uma nova confirmação ao usuário.

- O destino padrão é `origin/main`, salvo quando o usuário indicar outra branch.
- Inclua no commit apenas os arquivos da alteração concluída. Preserve alterações preexistentes ou não relacionadas e não inclua credenciais ou artefatos gerados.
- Antes do push, busque o histórico remoto e integre atualizações necessárias, preservando os commits e o trabalho existentes. Não use push forçado.
- Quando a integração afetar os arquivos ou o comportamento alterados, repita as verificações pertinentes antes de enviar.
- Se a validação ou a sincronização ficar bloqueada, informe o motivo e o estado do trabalho. Só declare o push concluído após confirmar o resultado remoto.
- Tarefas de consulta, análise ou explicação que não alterem arquivos não exigem um commit.
