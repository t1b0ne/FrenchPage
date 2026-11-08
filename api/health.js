import { healthHandler } from '../lib/api-handlers.js';

export default function handler(request, response) {
  return healthHandler(request, response);
}
