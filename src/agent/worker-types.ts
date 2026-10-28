// The workers' agent types (technical spec section 1). Each names a worker's definition,
// and the coordinator's Agent entry names the ones it can start (technical spec 6.5).
export const WORKER_TYPE = {
  stayResearcher: "stay-researcher",
  legScout: "leg-scout",
  weatherWorker: "weather-worker",
} as const;

export type WorkerType = (typeof WORKER_TYPE)[keyof typeof WORKER_TYPE];

const WORKER_TYPES: ReadonlySet<string> = new Set(Object.values(WORKER_TYPE));

// The worker hooks act only for our workers, never for the coordinator or any other
// agent type (technical spec 6.5).
export function isWorkerType(
  agentType: string | undefined,
): agentType is WorkerType {
  return agentType !== undefined && WORKER_TYPES.has(agentType);
}
