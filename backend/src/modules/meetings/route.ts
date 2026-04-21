import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createMeeting,
  createMeetingType,
  deleteMeeting,
  deleteMeetingType,
  getMeetingType,
  getMeetingTypeAvailability,
  listMeetingHostOptions,
  listMeetings,
  listMeetingTypes,
  replaceMeetingTypeAvailability,
  updateMeeting,
  updateMeetingType,
} from "@/modules/meetings/controller";
import {
  createMeetingSchema,
  createMeetingTypeSchema,
  listHostOptionsSchema,
  listMeetingsSchema,
  replaceAvailabilitySchema,
  updateMeetingSchema,
  updateMeetingTypeSchema,
} from "@/modules/meetings/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const meetingRoutes = new Hono<AppEnv>().basePath("/meetings");
meetingRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("meetings"));

meetingRoutes.get("/", validateQuery(listMeetingsSchema), listMeetings);
meetingRoutes.post("/", validateJson(createMeetingSchema), createMeeting);
meetingRoutes.patch("/:meetingId", validateJson(updateMeetingSchema), updateMeeting);
meetingRoutes.delete("/:meetingId", deleteMeeting);

meetingRoutes.get("/types", listMeetingTypes);
meetingRoutes.post("/types", validateJson(createMeetingTypeSchema), createMeetingType);
meetingRoutes.get("/types/:meetingTypeId", getMeetingType);
meetingRoutes.patch("/types/:meetingTypeId", validateJson(updateMeetingTypeSchema), updateMeetingType);
meetingRoutes.delete("/types/:meetingTypeId", deleteMeetingType);
meetingRoutes.get("/types/:meetingTypeId/availability", getMeetingTypeAvailability);
meetingRoutes.put("/types/:meetingTypeId/availability", validateJson(replaceAvailabilitySchema), replaceMeetingTypeAvailability);

meetingRoutes.get("/hosts/options", validateQuery(listHostOptionsSchema), listMeetingHostOptions);
