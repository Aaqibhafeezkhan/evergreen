import type { Detector } from "../domain.js";
import { githubActionsDetector } from "./github-actions.js";

export const builtInDetectors: readonly Detector[] = [githubActionsDetector];
