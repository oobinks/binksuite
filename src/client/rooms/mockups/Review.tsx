import type { ReviewDef } from "../shared/types";
import { Mockup } from "../../components/DemoArt";

export const mockupsReview: ReviewDef = {
  approveLabel: "👍 Love them → Listing Office",
  rejectLabel: "🔁 Restyle",
  startsReady: true,
  Body: ({ task }) => {
    const mockups = (task.output as { mockups: { scene: string; seed: number; imageKey?: string | null; slogan?: string | null }[] }).mockups;
    return (
      <div className="space-y-2">
        <p className="text-sm text-cocoa dark:text-stone-400">Stylist staged your print in {mockups.length} scenes. These become your listing photos.</p>
        <div className="grid grid-cols-2 gap-2">
          {mockups.map((m) => (
            <Mockup key={m.scene} scene={m.scene} seed={m.seed} imageKey={m.imageKey} slogan={m.slogan} />
          ))}
        </div>
      </div>
    );
  },
};
