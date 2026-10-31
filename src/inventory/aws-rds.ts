import type { InventoryImporter, InventoryItem } from "./types.js";

/** The three AWS CLI documents this importer reads, and the field that names each object. */
const DOCUMENTS = [
  ["DBInstances", "DBInstanceIdentifier"],
  ["DBClusters", "DBClusterIdentifier"],
  ["CacheClusters", "CacheClusterId"],
] as const;

interface EngineTarget {
  /** The provider's own lifecycle, sourced from the AWS release calendar. */
  aws: string;
  /** The upstream engine's lifecycle, when the reported version is an upstream version too. */
  upstream?: string;
}

/**
 * Engines this importer has reviewed rules for. MariaDB, SQL Server, Oracle, Db2, Memcached, and
 * Valkey are absent on purpose: shapes without a reviewed rule are skipped, never guessed.
 */
const ENGINES: Record<string, EngineTarget> = {
  postgres: { aws: "pkg:generic/aws-rds/postgres", upstream: "pkg:generic/postgresql" },
  mysql: { aws: "pkg:generic/aws-rds/mysql", upstream: "pkg:generic/mysql" },
  "aurora-postgresql": { aws: "pkg:generic/aws-aurora/postgresql", upstream: "pkg:generic/postgresql" },
  // The Aurora MySQL EngineVersion embeds the Aurora version (for example 8.0.mysql_aurora.3.10.0),
  // so it is not an upstream MySQL version and no upstream item is emitted.
  "aurora-mysql": { aws: "pkg:generic/aws-aurora/mysql" },
  aurora: { aws: "pkg:generic/aws-aurora/mysql" },
  redis: { aws: "pkg:generic/aws-elasticache/redis", upstream: "pkg:generic/redis" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObjectArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function hasAwsShape(document: unknown): boolean {
  if (!isRecord(document)) return false;
  return DOCUMENTS.some(([key]) => isObjectArray(document[key]));
}

/**
 * Reads `aws rds describe-db-instances`, `aws rds describe-db-clusters`, and
 * `aws elasticache describe-cache-clusters` output. Reads `Engine`, `EngineVersion`, and the
 * resource identifier only; ARNs, endpoints, and subnet data are never used or emitted.
 */
export const awsRdsImporter: InventoryImporter = {
  id: "aws-rds",
  registries: ["database"],

  detect(document: unknown): boolean {
    return hasAwsShape(document);
  },

  items(document: unknown, file: string): InventoryItem[] {
    if (!isRecord(document)) return [];
    const items: InventoryItem[] = [];
    for (const [key, identifierField] of DOCUMENTS) {
      const entries = document[key];
      if (!isObjectArray(entries)) continue;
      entries.forEach((entry, index) => {
        const engine = entry.Engine;
        const version = entry.EngineVersion;
        const resource = entry[identifierField];
        if (typeof engine !== "string" || typeof version !== "string" || version === "") return;
        if (typeof resource !== "string" || resource === "") return;
        const target = ENGINES[engine.toLowerCase()];
        if (!target) return;
        const pointer = `/${key}/${index}/EngineVersion`;
        items.push({ importer: "aws-rds", file, pointer, resource, purl: target.aws, version });
        if (target.upstream) {
          items.push({ importer: "aws-rds", file, pointer, resource, purl: target.upstream, version });
        }
      });
    }
    return items;
  },
};
