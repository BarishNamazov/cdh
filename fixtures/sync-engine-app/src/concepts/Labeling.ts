export const addLabel = (input: { item: string; user: string; text: string }) => ({ id: "" });
export const removeLabel = (input: { id: string }) => ({ removed: true });
export const _getLabels = (input: { item: string }) => [] as { id: string }[];
