export interface UserDoc {
  id: string;
  username: string;
  passwordHash: string;
  active: boolean;
}

export interface AuthenticatingState {
  users: UserDoc[];
}

export default class AuthenticatingConcept {
  private seq = 0;

  constructor(private readonly state: AuthenticatingState = { users: [] }) {
    this.seq = state.users.length;
  }

  async register(input: { username: string; password: string }): Promise<{ id: string } | { error: string }> {
    const username = input.username.trim();
    const password = input.password.trim();

    if (!username || !password) {
      return { error: "username and password are required" };
    }

    const exists = this.state.users.some((u) => u.username === username);
    if (exists) {
      return { error: "username already taken" };
    }

    const passwordHash = await Bun.password.hash(password);
    const id = `user-${++this.seq}`;

    this.state.users.push({ id, username, passwordHash, active: true });
    return { id };
  }

  async authenticate(input: { username: string; password: string }): Promise<{ ok: true; id: string } | { error: string }> {
    const user = this.state.users.find((u) => u.username === input.username && u.active);
    if (!user) {
      return { error: "invalid credentials" };
    }

    const valid = await Bun.password.verify(input.password, user.passwordHash);
    if (!valid) {
      return { error: "invalid credentials" };
    }

    return { ok: true, id: user.id };
  }

  async changePassword(input: { username: string; oldPassword: string; newPassword: string }): Promise<{ ok: true } | { error: string }> {
    const user = this.state.users.find((u) => u.username === input.username && u.active);
    if (!user) {
      return { error: "user not found" };
    }

    const valid = await Bun.password.verify(input.oldPassword, user.passwordHash);
    if (!valid) {
      return { error: "old password is incorrect" };
    }

    user.passwordHash = await Bun.password.hash(input.newPassword);
    return { ok: true };
  }

  unregister(input: { username: string }): { ok: true } | { error: string } {
    const user = this.state.users.find((u) => u.username === input.username && u.active);
    if (!user) {
      return { error: "user not found" };
    }

    user.active = false;
    return { ok: true };
  }

  _getUserByUsername(input: { username: string }): UserDoc[] {
    const user = this.state.users.find((u) => u.username === input.username);
    return user ? [user] : [];
  }

  _getUsers(): UserDoc[] {
    return this.state.users.filter((u) => u.active);
  }
}
