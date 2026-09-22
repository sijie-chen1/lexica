import { createHostedHandler } from '../server/vercel.js';
export default { fetch: createHostedHandler() };
