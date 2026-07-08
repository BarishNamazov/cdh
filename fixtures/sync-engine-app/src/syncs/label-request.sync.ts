import { sync, when, act } from "../engine-stub/engine.ts";
import type { Vars } from "../engine-stub/engine.ts";
import * as Requesting from "../concepts/Requesting.ts";
import * as Labeling from "../concepts/Labeling.ts";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, { requestId: "" }).then(
    act(Labeling.addLabel, { item, user, text }),
  ),
);
