import { z } from "zod";

export const membershipParamSchema = z.object({
  membershipId: z.string().uuid(),
});

export const updateMembershipSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});

export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
