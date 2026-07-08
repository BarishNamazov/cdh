// @ts-nocheck — DSL patterns reference concept namespaces
import Greeting from "../concepts/Greeting/GreetingConcept.ts";
import type { Vars } from "@mit-sdg/sync-engine";
import { act, on, onError, sync, when } from "@mit-sdg/sync-engine";

export const greetingAuditSync = sync(({ name, message, error }: Vars) =>
  when(Greeting.greet, { name }, { message }).then(
    act(Greeting._getHistory).branch(
      on(act(() => {})),
      onError({ error }, act(() => {})),
    ),
  ),
);
