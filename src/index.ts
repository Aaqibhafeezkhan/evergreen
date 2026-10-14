export { scanRepository } from "./engine.js";
export { analyzeSourceUsage } from "./source-usage.js";
export {
  createMigrationPacket,
  MigrationPacketValidationError,
  validateMigrationPacket,
} from "./migration-packet.js";
export type { MigrationPacket, MigrationStep, VerificationCommand } from "./migration-packet.js";
export { runGitHubAction } from "./github-action.js";
export type {
  AnnotationLevel,
  GitHubActionOptions,
  GitHubActionOutcome,
  GitHubAnnotation,
  SeverityGate,
} from "./github-action.js";
export { EvergreenAgentTools, FindingNotObservedError } from "./agent-tools.js";
export type { DeprecationList, DeprecationSummary, MigrationVerification } from "./agent-tools.js";
export { createEvergreenMcpServer, MCP_TOOL_NAMES } from "./mcp.js";
export * from "./sdk.js";
