import { en } from './en';

type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type MessageKey = keyof typeof en;
export type Catalog = Partial<Record<MessageKey, string | PluralMessage>>;
type TextOf<T> = T extends string ? T : T extends object ? T[keyof T] : never;
type Placeholders<T> = T extends `${string}{${infer Param}}${infer Rest}`
  ? Param | Placeholders<Rest>
  : never;
type Params<K extends MessageKey> = Placeholders<TextOf<(typeof en)[K]>>;
type Args<K extends MessageKey> = [Params<K>] extends [never]
  ? [values?: Record<string, never>]
  : [values: Record<Params<K>, string | number>];

export function createTranslator(locale: string, catalog: Catalog = {}) {
  const plural = new Intl.PluralRules(locale);
  const fallbackPlural = new Intl.PluralRules('en');
  const numbers = new Intl.NumberFormat(locale);
  return <K extends MessageKey>(key: K, ...[values]: Args<K>): string => {
    const translated = catalog[key];
    const message: string | PluralMessage = translated ?? en[key];
    const parameters = values as Record<string, string | number> | undefined;
    const template =
      typeof message === 'string'
        ? message
        : (message[(translated ? plural : fallbackPlural).select(Number(parameters?.count ?? 0))] ??
          message.other);
    // Values stay plain text; callers use React text nodes or escape in HTML documents.
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = parameters?.[name];
      return value === undefined
        ? placeholder
        : typeof value === 'number'
          ? numbers.format(value)
          : value;
    });
  };
}

// Register another catalog here when it has been translated and reviewed.
// English is the only shipping locale. Do not infer an untranslated locale from the device.
export const locale = 'en';
export const direction = 'ltr';
export const t = createTranslator(locale);
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
export function formatBytes(value: number): string {
  const unit = value < 1024 ? 'byte' : value < 1024 * 1024 ? 'kilobyte' : 'megabyte';
  const divisor = unit === 'byte' ? 1 : unit === 'kilobyte' ? 1024 : 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'megabyte' ? 1 : 0,
  }).format(value / divisor);
}
