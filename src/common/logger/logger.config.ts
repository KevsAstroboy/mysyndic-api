import { Params } from 'nestjs-pino';
import { Options } from 'pino-http';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.password_hash',
  '*.old_password',
  '*.new_password',
  '*.secret',
  '*.token',
  '*.access_token',
  '*.refresh_token',
  '*.PAYSTACK_SECRET_KEY',
  '*.GMAIL_APP_PASSWORD',
];

export function buildLoggerParams(): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL || 'info';

  const pinoHttpOptions: Options & {
    redact?: { paths: string[]; censor: string };
    transport?: unknown;
  } = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    base: { service: 'mysyndic-api' } as never,
    genReqId: () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    autoLogging: {
      ignore: (req) => {
        const url = (req as { url?: string }).url ?? '';
        return url.startsWith('/api/docs');
      },
    },
    serializers: {
      req(req) {
        return { id: (req as { id?: unknown }).id, method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: (res as { statusCode?: unknown }).statusCode };
      },
    },
  };

  

  if (!isProd && !['test', 'ci'].includes(process.env.NODE_ENV ?? '')) {
    pinoHttpOptions.transport = {
      target: 'pino-pretty',
      options: { colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss' },
    };
  }

  const opts = pinoHttpOptions as Options & {
    onResponse?: (req: unknown, res: unknown) => void;
  };
  opts.onResponse = (req, res) => {
    const rid = (req as { id?: unknown }).id;
    if (rid && typeof (res as { setHeader?: unknown }).setHeader === 'function') {
      (res as { setHeader: (k: string, v: unknown) => void }).setHeader(
        'X-Request-Id',
        String(rid),
      );
    }
  };

  return { pinoHttp: opts };
}