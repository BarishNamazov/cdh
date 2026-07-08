export const authenticate = (input: { username: string; password: string }) => ({ token: "" });
export const validateToken = (input: { token: string }) => ({ valid: true, user: "user" });
