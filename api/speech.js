import { speechHandler } from '../lib/api-handlers.js';

export default function handler(request, response) {
  return speechHandler(request, response);
}
