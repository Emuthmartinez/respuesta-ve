import { z } from 'zod';

// Validation for a building-damage report. Mirrors the columns the public
// is allowed to insert (RLS column grants in 0001_init.sql).
export const reportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  damage_level: z.enum([
    'collapsed', 'severe', 'moderate', 'minor', 'no_visible_damage', 'unknown',
  ]),
  people_status: z.enum([
    'confirmed_trapped', 'possible', 'none_reported', 'unknown',
  ]),
  people_count_estimate: z.number().int().min(0).max(100000).nullable().optional(),
  estado: z.string().max(120).nullable().optional(),
  municipio: z.string().max(120).nullable().optional(),
  parroquia: z.string().max(120).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  reporter_contact: z.string().max(200).nullable().optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;
