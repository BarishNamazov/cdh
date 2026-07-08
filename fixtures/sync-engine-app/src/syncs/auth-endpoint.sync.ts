import { createEndpointDsl, syncMap } from "../engine-stub/sdk.ts";
import { Sync } from "../engine-stub/engine.ts";
import * as Requesting from "../concepts/Requesting.ts";

const dsl = createEndpointDsl(Requesting);

export const auth = dsl.defineEndpoint("/auth/login", ({ Sync, Request, Respond, Fail, Actions }) => ({
  login: Sync(({ username, password, token }: { username: string; password: string; token: string }) => ({
    when: Actions(Request({ username, password })),
    then: Actions(
      Respond({ token }),
    ),
  })),
}));

Sync.register(syncMap({ auth }));
