import { chatHandler } from '../lib/api-handlers.js';

export default function handler(request, response) {
  return chatHandler(request, response);
}
