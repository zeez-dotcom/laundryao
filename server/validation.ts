import { z } from "zod";

export const insertPackageItemSchema = z.object({
  serviceId: z.string(),
  clothingItemId: z.string(),
  credits: z.coerce.number(),
  paidCredits: z.coerce.number().optional(),
  categoryId: z.string().optional(),
});

export type InsertPackageItemInput = z.infer<typeof insertPackageItemSchema>;
