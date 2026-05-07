import type { DomainError } from './errors';
import type { TraceEntry } from '../types';

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type TaskResult<T, E = DomainError> =
  | { ok: true; value: T; trace: TraceEntry[] }
  | { ok: false; error: E; trace: TraceEntry[] };

export const ok = <T>(v: T): Result<T, never> => ({ ok: true as const, value: v });
export const err = <E>(e: E): Result<never, E> => ({ ok: false as const, error: e });
export const task_ok = <T>(v: T, t: TraceEntry[]): TaskResult<T, never> => ({ ok: true as const, value: v, trace: t });
export const task_err = <E>(e: E, t: TraceEntry[]): TaskResult<never, E> => ({ ok: false as const, error: e, trace: t });
