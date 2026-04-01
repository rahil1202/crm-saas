import { describe, expect, test } from "bun:test";

import { AppError } from "@/lib/errors";
import { hasMinimumRole } from "@/middleware/roles";

describe("role authorization helper", () => {
  test("owner satisfies admin and member requirements", () => {
    expect(hasMinimumRole("owner", "admin")).toBe(true);
    expect(hasMinimumRole("owner", "member")).toBe(true);
  });

  test("member does not satisfy admin requirements", () => {
    expect(hasMinimumRole("member", "admin")).toBe(false);
  });
});

describe("AppError factories", () => {
  test("unauthorized generates contract-compatible error", () => {
    const error = AppError.unauthorized("Missing bearer token");
    expect(error.status).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Missing bearer token");
  });

  test("validation error details are retained", () => {
    const error = AppError.badRequest("Validation failed", { field: "email" });
    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.details).toEqual({ field: "email" });
  });
});

