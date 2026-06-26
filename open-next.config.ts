import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Minimal config: SSR + route handlers on Workers, no ISR cache needed yet.
// Add an incremental cache binding here (KV/R2) if/when we introduce ISR.
export default defineCloudflareConfig({});
