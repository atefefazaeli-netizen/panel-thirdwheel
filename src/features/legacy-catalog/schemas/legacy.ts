// Mirrors the existing DTOs (catalog.dto.ts CreateItemDto, experience.dto.ts CreateExperienceDto,
// ideas.controller.ts VenueSiteDto).
import { z } from 'zod';
import { optionalEnum, pageSearch } from '@/lib/search';
import { DUR_VALUES, EXP_KEYS, KIDS_VALUES, LIVING_VALUES } from '../api/types';

export const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
const opt = (max: number) => z.string().trim().max(max, `At most ${max} characters.`);

export const catalogSearchSchema = z.object({
  where: optionalEnum(['home', 'out']),
  kind: optionalEnum(['book', 'guided', 'home', 'place']),
  maxUsd: z.coerce.number().int().min(0).optional().catch(undefined),
  ...pageSearch,
});

export const experienceSearchSchema = z.object({ exp: optionalEnum(EXP_KEYS), ...pageSearch });

export const catalogItemSchema = z.object({
  id: z.number({ error: 'A number.' }).int().min(1, 'From 1.').max(1_000_000).nullable(),
  title: z.string().trim().min(1, 'Title is required.').max(120),
  where: z.enum(['home', 'out']),
  usd: z.number({ error: 'Price in whole USD.' }).int('Whole dollars.').min(0),
  per: z.string().max(60, 'At most 60 characters.'),
  reason: z.string().trim().min(1, 'Say why it fits.').max(300),
  meta: z.string().trim().min(1, 'Meta line is required.').max(200),
  kind: z.enum(['book', 'guided', 'home', 'place']),
  provider: opt(120),
  site: opt(120),
  deposit: z.number().int().min(0).nullable(),
  cancel: opt(300),
  slots: z.array(z.string().trim().min(1).max(30)).max(20),
  weekendOnly: z.boolean(),
  voucher: z.boolean(),
  d: z
    .string()
    .trim()
    .min(1, 'Icon path is required.')
    .max(600)
    .regex(SVG_PATH, 'SVG path data only (M, L, C, A, Z and numbers).'),
  tags: z.array(z.string().regex(/^[a-z-]{2,24}$/, 'Tags: 2 to 24 of a-z and dashes.')).max(20),
  refPrefix: z
    .string()
    .trim()
    .regex(/^([A-Z]{2,4})?$/, '2 to 4 capital letters.'),
});
export type CatalogItemForm = z.infer<typeof catalogItemSchema>;

const jsonObject = (label: string) =>
  z.string().superRefine((s, ctx) => {
    if (!s.trim()) return;
    try {
      const v = JSON.parse(s) as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v))
        ctx.addIssue({ code: 'custom', message: `${label} must be a JSON object.` });
    } catch {
      ctx.addIssue({ code: 'custom', message: `${label} is not valid JSON.` });
    }
  });

export const experienceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Slug: 2 to 40 of a-z, 0-9 and dashes.'),
    exp: z.enum(EXP_KEYS),
    title: z.string().trim().min(1, 'Title is required.').max(140),
    meta: z.string().trim().min(1, 'Meta line is required.').max(160),
    reason: z.string().trim().min(1, 'Say why it fits.').max(300),
    d: z
      .string()
      .trim()
      .max(600)
      .regex(/^([MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+)?$/, 'SVG path data only.'),
    items: z.array(z.string().trim().min(1).max(200)).max(12),
    tag: opt(40),
    kind: opt(20),
    onlyDur: z.array(z.enum(DUR_VALUES)),
    onlyKids: z.array(z.enum(KIDS_VALUES)),
    onlyLiving: z.array(z.enum(LIVING_VALUES)),
    no: z.array(z.enum(DUR_VALUES)),
    pText: jsonObject('Weights'),
    cmdText: jsonObject('Command'),
  })
  .superRefine((v, ctx) => {
    if (v.cmdText.trim()) {
      try {
        const c = JSON.parse(v.cmdText) as { screen?: unknown };
        if (typeof c.screen !== 'string')
          ctx.addIssue({ code: 'custom', path: ['cmdText'], message: 'Command needs a "screen".' });
      } catch {
        // reported above
      }
    }
    if (v.pText.trim()) {
      try {
        const p = JSON.parse(v.pText) as Record<string, unknown>;
        if (Object.values(p).some((x) => typeof x !== 'number'))
          ctx.addIssue({ code: 'custom', path: ['pText'], message: 'Weights are numbers, like {"talk": 3}.' });
      } catch {
        // reported above
      }
    }
  });
export type ExperienceForm = z.infer<typeof experienceSchema>;

export const bookingLinkSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'A Do card id, like pottery-for-two.'),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => {
      try {
        return new URL(u).protocol === 'https:';
      } catch {
        return false;
      }
    }, 'An https URL.'),
  venue: opt(120),
  paid: z.boolean(),
});
