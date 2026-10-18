import { z } from 'zod';

const ref = z.union([z.string().min(1).max(1000), z.number().int().positive()]);
const a1 = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]*(?::[A-Z]{1,3}[1-9][0-9]*)?$/);
export const target = { sheet: ref, table: ref, range: a1 };
export const rangeTarget = z.strictObject(target);
const cell = z.strictObject({ ...target, range: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]*$/) });
const scalar = z.union([z.string().max(32768), z.number().finite(), z.boolean(), z.null()]);
export const inputValue = z.union([scalar, z.strictObject({ formula: z.string().min(2).max(32768).startsWith('=') }), z.strictObject({ date: z.iso.datetime({ offset: true }) })]);
export const rule = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('required'), source: rangeTarget }),
  z.strictObject({ kind: z.literal('unique'), source: rangeTarget }),
  z.strictObject({ kind: z.literal('formula'), source: rangeTarget }),
  z.strictObject({ kind: z.literal('numeric_bounds'), source: rangeTarget, min: z.number().finite().optional(), max: z.number().finite().optional() }),
  z.strictObject({ kind: z.literal('equals'), source: cell, value: scalar, tolerance: z.number().finite().nonnegative().default(1e-8) }),
  z.strictObject({ kind: z.literal('balance'), terms: z.array(z.strictObject({ source: cell, coefficient: z.number().finite().default(1) })).min(1).max(20), expected: z.number().finite(), tolerance: z.number().finite().nonnegative().default(1e-8) })
]);
export const checks = z.array(rule).max(50).default([]);
export const consistency = { preview: z.boolean().default(true), expected_revision: z.string().regex(/^[a-f0-9]{64}$/).optional(), save: z.boolean().default(true) };
export const edit = z.strictObject({ sheet: ref, table: ref, start: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]*$/), values: z.array(z.array(inputValue).min(1).max(1000)).min(1).max(2000) });
export const mapping = z.strictObject({
  source: z.string().min(1).max(1000), target: z.string().min(1).max(1000),
  type: z.enum(['text', 'number', 'boolean', 'date']),
  decimal_separator: z.enum(['.', ',']).default('.'), group_separator: z.enum(['none', '.', ',', 'space']).default('none'),
  date_format: z.enum(['iso', 'dd/mm/yyyy', 'yyyy-mm-dd']).default('iso'),
  empty: z.enum(['clear', 'skip', 'error']).default('clear')
});
