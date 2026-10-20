import type { ReviewDef } from "../shared/types";
import { Mockup } from "../../components/DemoArt";
import { PhotoMockup } from "../../components/PhotoMockup";
import type { MockupView } from "../../../shared/mockupScenes";

export const mockupsReview: ReviewDef = {
  approveLabel: "Approve photos → Listing Office",
  rejectLabel: "Restyle",
  startsReady: true,
  Body: ({ task }) => {
    const mockups = (task.output as { mockups: MockupView[] }).mockups;
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Stylist staged your {task.productFormat === "excel" ? "spreadsheet" : task.productFormat === "pdf" ? "printable" : "print"} in {mockups.length} scenes. These become your listing photos.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {mockups.map((m) =>
            // Photo mockups (real products) carry a bgKey, even when it's null.
            "bgKey" in m ? <PhotoMockup key={m.scene} view={m} /> : <Mockup key={m.scene} scene={m.scene} seed={m.seed} imageKey={m.imageKey} slogan={m.slogan} />,
          )}
        </div>
      </div>
    );
  },
};
