export type Vars = Record<string, unknown>;

type WhenFn<A> = A;
type ActFn<A> = A;

interface SyncBuilder {
  then: <T>(acts: T) => T;
  where: <T>(fn: (frames: Frames) => T) => SyncBuilderWithWhere<T>;
}

interface SyncBuilderWithWhere<T> {
  then: <U>(acts: U) => U;
}

interface Frames {
  query: <T>(fn: unknown, input: unknown, output: unknown) => T;
  queryOptional: <T>(fn: unknown, input: unknown, output: unknown) => T;
}

export function sync<T>(fn: (vars: Vars) => T): T {
  return fn({});
}

export function when<A>(action: A, input?: unknown, output?: unknown): SyncBuilder {
  const builder: SyncBuilder = {
    then: <T>(acts: T): T => acts,
    where: <T>(fn: (frames: Frames) => T): SyncBuilderWithWhere<T> => {
      const result = fn({
        query: <T>(_fn: unknown, _input: unknown, _output: unknown): T => ({}) as T,
        queryOptional: <T>(_fn: unknown, _input: unknown, _output: unknown): T => ({}) as T,
      });
      return {
        then: <U>(acts: U): U => acts,
      };
    },
  };
  return builder;
}

export function act<A>(action: A, input?: unknown, output?: unknown): A & { branch: typeof branch; as: typeof asFn } {
  const result = action as A & { branch: typeof branch; as: typeof asFn };
  result.branch = branch;
  result.as = asFn;
  return result;
}

function branch(..._args: unknown[]): void {}
function asFn(_bindings: unknown): void {}

export function on(..._args: unknown[]): void {}
export function onError(..._args: unknown[]): void {}
export function seq(..._args: unknown[]): void {}

export const Sync = {
  register: (..._args: unknown[]): void => {},
};
