import * as Labeling from "../concepts/Labeling.ts";
import * as Requesting from "../concepts/Requesting.ts";
import type { Vars } from "@mit-sdg/sync-engine/engine";
import { act, sync, when } from "@mit-sdg/sync-engine/engine";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, { requestId: "" }).then(
    act(Labeling.addLabel, { item, user, text })
  )
);
