import type { BatchHistorySource } from "../types/BatchFile";

export class BatchHistoryUnavailable extends Error {
  constructor() {
    super("Filhistorik kan inte hämtas ännu. Batch-API är inte anslutet. Du kan fortfarande ladda upp och granska CSV lokalt.");
    this.name = "BatchHistoryUnavailable";
  }
}

export function createBatchHistorySource(preview: string | null, pagination: string | null,
  scenario: string | null): BatchHistorySource {
  const mode = pagination === "cursor" ? "cursor" : "client";
  if (import.meta.env.DEV && preview === "fixtures") {
    return {
      kind: "development", pagination: mode,
      async list(query, cursor, signal) {
        const fixtures = await import("../dev/batchFixtures");
        return fixtures.readFixturePage(query, cursor, signal, mode, scenario);
      },
      async detail(id, signal) {
        const fixtures = await import("../dev/batchFixtures");
        return fixtures.readFixtureDetail(id, signal, scenario);
      },
    };
  }
  return {
    kind: "unavailable", pagination: "client",
    async list() { throw new BatchHistoryUnavailable(); },
    async detail() { throw new BatchHistoryUnavailable(); },
  };
}
