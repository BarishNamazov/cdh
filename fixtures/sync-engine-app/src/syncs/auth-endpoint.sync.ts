import * as Requesting from "../concepts/Requesting.ts";
import { Sync } from "@mit-sdg/sync-engine/engine";
import { createEndpointDsl, syncMap } from "@mit-sdg/sync-engine/sdk";

const dsl = createEndpointDsl(Requesting);

export const auth = dsl.defineEndpoint("/auth/login", ({ Sync, Request, Respond, Fail, Actions }) => ({
  login: Sync(({ username, password, token }: { username: string; password: string; token: string }) => ({
    when: Actions(Request({ username, password })),
    then: Actions(Respond({ token })),
  })),
}));

Sync.register(syncMap({ auth }));
