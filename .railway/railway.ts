import { defineRailway, project, service } from 'railway/iac';

// Esta configuração administra somente o serviço deste repositório.
export const partial = 'compras-web';

export default defineRailway((ctx) => {
  const web = service('compras-web', {
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'Dockerfile',
    },
    start: 'node --max-old-space-size=512 src/server.js',
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    replicas: 1,
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    env: {
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      // PORT é fornecida pelo Railway. Outras opções usam src/config.js.
    },
  });

  return project(ctx.projectName ?? 'compras-web', { resources: [web] });
});
