// `node --import ./scripts/test/register-alias.mjs <test.mjs>` registers the
// @/-alias + extensionless-.ts resolver for offline unit tests.
import { register } from 'node:module';
register('./alias-loader.mjs', import.meta.url);
