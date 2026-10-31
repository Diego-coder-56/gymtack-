// Función serverless de Netlify: toda la API (/api/*) corre aquí.
import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';

export const handler = serverless(createApp(), { binary: ['image/*'] });
