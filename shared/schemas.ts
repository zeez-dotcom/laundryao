import { z } from "zod";
import { insertCustomerSchema } from "./schema";

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const passwordSchema = (
  message = "Password must be at least 8 characters long and include uppercase, lowercase letters and a number",
) =>
  z
    .string()
    .min(8, { message })
    .regex(/[a-z]/, { message })
    .regex(/[A-Z]/, { message })
    .regex(/\d/, { message });

export const customerFormSchema = insertCustomerSchema
  .pick({ phoneNumber: true, name: true, nickname: true })
  .extend({
    phoneNumber: z.string().min(1, "Phone number is required"),
    name: z.string().min(1, "Name is required"),
    nickname: z.string().optional(),
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerFormInput = z.infer<typeof customerFormSchema>;
