import * as Labeling from "../concepts/Labeling.ts";
import * as Requesting from "../concepts/Requesting.ts";
import type { Vars } from "@mit-sdg/sync-engine";
import { act, sync, when } from "@mit-sdg/sync-engine";

export const labelRequestSync = sync(({ item, user, text }: Vars) =>
  when(Requesting.createLabelRequested, { item, user, text }, { requestId: "" }).then(
    act(Labeling.addLabel, { item, user, text })
  )
);
