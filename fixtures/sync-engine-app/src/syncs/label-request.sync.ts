import * as Labeling from "../concepts/Labeling.ts";
import * as Requesting from "../concepts/Requesting.ts";
import type { Vars } from "../engine-stub/engine.ts";
import { act, sync, when } from "../engine-stub/engine.ts";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, { requestId: "" }).then(
    act(Labeling.addLabel, { item, user, text })
  )
);
