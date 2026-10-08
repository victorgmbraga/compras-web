import { createApplicationUI } from './app.js';
import { createHttpService } from './http-service.js';
createApplicationUI(createHttpService());
