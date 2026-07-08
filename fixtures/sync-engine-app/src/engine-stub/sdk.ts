interface EndpointDsl {
  defineEndpoint: (path: string, fn: (helpers: EndpointHelpers) => Record<string, unknown>) => Record<string, unknown>;
}

interface EndpointHelpers {
  Sync: <T>(fn: (vars: Record<string, unknown>) => T) => T;
  Request: (data: unknown) => unknown;
  Respond: (data: unknown) => unknown;
  Fail: (error: unknown) => unknown;
  Actions: (...args: unknown[]) => unknown[];
}

export function createEndpointDsl(_boundary: unknown): EndpointDsl {
  return {
    defineEndpoint: (_path: string, fn: (helpers: EndpointHelpers) => Record<string, unknown>) => {
      return fn({
        Sync: <T>(fn: (vars: Record<string, unknown>) => T) => fn({}),
        Request: (data: unknown) => data,
        Respond: (data: unknown) => data,
        Fail: (error: unknown) => error,
        Actions: (...args: unknown[]) => args,
      });
    },
  };
}

export function syncMap(_map: Record<string, unknown>): Record<string, unknown> {
  return _map;
}
