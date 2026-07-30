import type { SupabaseClient } from "@supabase/supabase-js";

export interface ParallelCommandResult {
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly data: Record<string, unknown> | null;
  readonly error: { code?: string; message: string } | null;
}

export interface ParallelRaceResult {
  readonly a: ParallelCommandResult;
  readonly b: ParallelCommandResult;
  readonly releaseSkewMs: number;
  readonly overlapped: boolean;
  readonly deadlock: boolean;
}

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => { resolve = accept; });
  return { promise, resolve };
};

async function execute(
  gate: Promise<void>,
  client: SupabaseClient,
  rpc: string,
  command: Record<string, unknown>,
  timeoutMs: number,
): Promise<ParallelCommandResult> {
  await gate;
  const startedAt = performance.now();
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`Parallel command exceeded ${timeoutMs}ms.`)), timeoutMs);
    timer.unref?.();
  });
  const response = await Promise.race([
    client.schema("erp").rpc(rpc, { command }),
    timeout,
  ]);
  const finishedAt = performance.now();
  return {
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    data: (response.data as Record<string, unknown> | null) ?? null,
    error: response.error ? { code: response.error.code, message: response.error.message } : null,
  };
}

export async function executeParallelCommandRace(input: {
  clientA: SupabaseClient;
  clientB: SupabaseClient;
  rpcA: string;
  rpcB?: string;
  commandA: Record<string, unknown>;
  commandB: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ParallelRaceResult> {
  const gate = deferred();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const taskA = execute(gate.promise, input.clientA, input.rpcA, input.commandA, timeoutMs);
  const taskB = execute(gate.promise, input.clientB, input.rpcB ?? input.rpcA, input.commandB, timeoutMs);
  await Promise.resolve();
  gate.resolve();
  const [a, b] = await Promise.all([taskA, taskB]);
  const releaseSkewMs = Math.abs(a.startedAt - b.startedAt);
  const overlapped = Math.max(a.startedAt, b.startedAt) <= Math.min(a.finishedAt, b.finishedAt);
  const errors = [a.error, b.error].filter(Boolean);
  const deadlock = errors.some((error) => error?.code === "40P01" || /deadlock/i.test(error?.message ?? ""));
  return { a, b, releaseSkewMs, overlapped, deadlock };
}
