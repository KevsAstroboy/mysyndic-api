const DATE_ONLY_FIELDS = new Set<string>([]);

const TIME_ONLY_FIELDS = new Set<string>([]);

const TOKEN_MAP: Record<string, (d: Date) => string> = {
  dd: (d) => String(d.getDate()).padStart(2, '0'),
  MM: (d) => String(d.getMonth() + 1).padStart(2, '0'),
  yyyy: (d) => String(d.getFullYear()),
  HH: (d) => String(d.getHours()).padStart(2, '0'),
  mm: (d) => String(d.getMinutes()).padStart(2, '0'),
  ss: (d) => String(d.getSeconds()).padStart(2, '0'),
};

const TOKEN_REGEX = /\b(dd|MM|yyyy|HH|mm|ss)\b/g;

export function formatDate(date: Date, format: string): string {
  return format.replace(TOKEN_REGEX, (match) => {
    const fn = TOKEN_MAP[match];
    return fn ? fn(date) : match;
  });
}

export function detectFieldFormat(fieldName: string): string {
  if (DATE_ONLY_FIELDS.has(fieldName)) return 'dd/MM/yyyy';
  if (TIME_ONLY_FIELDS.has(fieldName)) return 'HH:mm:ss';
  return 'dd/MM/yyyy HH:mm:ss';
}

export function transformDates(
  obj: unknown,
  customFormat?: string,
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Buffer.isBuffer(obj)) return obj;
  if (ArrayBuffer.isView(obj)) return obj;

  if (obj instanceof Date) {
    return formatDate(obj, customFormat ?? 'dd/MM/yyyy HH:mm:ss');
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformDates(item, customFormat));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value instanceof Date) {
        const format = customFormat ?? detectFieldFormat(key);
        result[key] = formatDate(value, format);
      } else if (value !== null && typeof value === 'object') {
        result[key] = transformDates(value, customFormat);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}