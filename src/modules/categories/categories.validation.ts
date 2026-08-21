import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    icon: z.string().trim().max(60).optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex value like #RRGGBB')
      .optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    icon: z.string().trim().max(60).nullable().optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex value like #RRGGBB')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, 'At least one field must be provided');

export const categoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listCategoriesQuerySchema = z
  .object({
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
