import { handleAPI } from './api.js';

// Only deployed runtime settings enter the hosted handler. Never load the
// laptop's .local-ai.json or enable its loopback-only configuration bypass.
export function createHostedHandler(environment = process.env) {
  return async function hostedHandler(request) {
    const env = {
      OPENAI_API_KEY: environment.OPENAI_API_KEY,
      OPENAI_BASE_URL: environment.OPENAI_BASE_URL,
      OPENAI_MODEL: environment.OPENAI_MODEL,
      APP_PASSWORD: environment.APP_PASSWORD,
      COOKIE_SECURE: 'true',
      LOCAL_DESKTOP: false,
    };
    // Vercel overwrites this trusted forwarding header at its edge.
    const client = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'hosted';
    const response = await handleAPI(request, env, client);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'same-origin');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  };
}
