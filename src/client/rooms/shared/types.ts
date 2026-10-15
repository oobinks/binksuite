import type { FC } from "react";
import type { TaskView } from "../../../shared/api";
import type { Settings } from "../../../shared/settings";

export interface ReviewBodyProps {
  task: TaskView;
  settings: Settings;
  /** Some reviews (e.g. the Inspector's card stack) must be finished before Approve unlocks. */
  setReady: (ready: boolean) => void;
}

export interface ReviewDef {
  Body: FC<ReviewBodyProps>;
  approveLabel: string | ((task: TaskView) => string);
  rejectLabel: string | ((task: TaskView) => string);
  /** Approve needs a note (e.g. a compliance override). */
  approveNeedsNote?: (task: TaskView) => boolean;
  startsReady?: boolean;
}
