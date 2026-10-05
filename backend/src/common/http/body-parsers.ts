import { IncomingMessage } from 'http';
import { NestExpressApplication } from '@nestjs/platform-express';

/** The one route whose JSON body may exceed the default limit: a spreadsheet of up to 1000 leads. */
export const LEAD_IMPORT_PATH = '/api/v1/crm/leads/import';
export const LEAD_IMPORT_BODY_LIMIT = '3mb';

const isJson = (req: IncomingMessage) => (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');
const isLeadImport = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://localhost').pathname === LEAD_IMPORT_PATH;

/**
 * The request body parsers Nest would register (JSON and URL-encoded, 100 kB),
 * plus a larger JSON limit for the lead import route only. The app must be
 * created with `bodyParser: false`. The import parser runs first; the default
 * JSON parser then skips a body that is already parsed.
 */
export function registerBodyParsers(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: LEAD_IMPORT_BODY_LIMIT, type: (req) => isLeadImport(req) && isJson(req) });
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
}
