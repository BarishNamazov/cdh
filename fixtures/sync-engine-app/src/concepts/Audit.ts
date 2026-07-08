export const record = (input: { id: string; event: string; targetId?: string; error?: string }) => ({ recorded: true });
export const _getEvents = (input: { targetId: string }) => [] as { event: string }[];
