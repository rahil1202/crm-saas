import { z } from "zod";

export const membershipParamSchema = z.object({
  membershipId: z.string().uuid(),
});

export const membershipActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const membershipAssignedLeadsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateMembershipSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});

export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type MembershipActivityQuery = z.infer<typeof membershipActivityQuerySchema>;
export type MembershipAssignedLeadsQuery = z.infer<typeof membershipAssignedLeadsQuerySchema>;
