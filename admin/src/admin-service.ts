import seed from "virtual:shop-seed";
import { createInitialState } from "./domain";
import { createRepository } from "./repository";
import { createAdminService } from "./service";

// This adapter is the only place that chooses local persistence instead of a future backend.
export const adminService = createAdminService(
  createRepository(() => createInitialState(seed)),
  sessionStorage,
);
