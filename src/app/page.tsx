import { StageProvider } from "@/components/StageProvider";
import { Hanging } from "@/components/Hanging";
import { Floor } from "@/components/Floor";
import { Biography, DebugReadout, ErrorNote, LensHint, LiveNarration, ReturnNote, ReverseLegend, SummaryDialog } from "@/components/Panels";
import { Colophon, ParishRoll } from "@/components/ParishRoll";

export default function Home() {
  return (
    <StageProvider>
      <a className="skip" href="#roll">
        Skip to the parish roll
      </a>
      <main>
        <Hanging>
          <Floor />
          <Biography />
          <ReverseLegend />
          <LensHint />
          <DebugReadout />
          <ErrorNote />
        </Hanging>
        <ParishRoll />
      </main>
      <Colophon />
      <SummaryDialog />
      <ReturnNote />
      <LiveNarration />
    </StageProvider>
  );
}
