export const createLabelRequested = (input: { item: string; user: string; text: string }) => ({ requestId: "" });
export const request = (input: { path: string; payload?: unknown }) => ({ request: input });
export const respond = (input: { request: unknown; status: number; body?: unknown }) => ({ ok: true });
