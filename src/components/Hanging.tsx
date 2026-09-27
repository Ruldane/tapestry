"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useStage, useUi } from "./StageProvider";
import { StitchedText } from "./StitchedText";
import { FRAMING, FRAMING_RETURN, KEEPER } from "@/text/keeper";

/**
 * The walk: a tall section with the hanging on a sticky stage. How far down
 * the section you scroll is how far along the cloth you have walked.
 */
export function Hanging({ children }: { children?: ReactNode }) {
  const stage = useStage();
  const walk = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lens = useRef<HTMLCanvasElement>(null);
  const wall = useRef<HTMLDivElement>(null);
  const flipper = useRef<HTMLDivElement>(null);
  const you = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const hover = useRef<HTMLDivElement>(null);
  const captions = useRef<(HTMLElement | null)[]>([]);
  const ready = useUi((s) => s.ready);
  const back = useUi((s) => s.back);
  const lensOn = useUi((s) => s.lens);

  useEffect(() => {
    if (!stage || !walk.current || !stageEl.current || !canvas.current || !lens.current) return;
    return stage.attach({
      walk: walk.current,
      stage: stageEl.current,
      canvas: canvas.current,
      lens: lens.current,
      wall: wall.current,
      captions: captions.current,
      windowMark: document.querySelector("[data-selvedge-window]"),
      strangerMark: document.querySelector("[data-selvedge-stranger]"),
      selectedMark: document.querySelector("[data-selvedge-selected]"),
      youTag: you.current,
      nameTag: name.current,
      hoverTag: hover.current,
      flipper: flipper.current,
    });
  }, [stage]);

  return (
    <div ref={walk} className="walk" id="hanging">
      <section ref={stageEl} className="stage" aria-labelledby="title" data-back={back ? "1" : "0"} data-lens={lensOn ? "1" : "0"}>
        <WallLabel wallRef={wall} />
        <div ref={flipper} className="flipper">
          <canvas
            ref={canvas}
            className="cloth"
            role="img"
            aria-label={
              back
                ? "The back of the hanging: the tangle of threads between the villagers. Kin, love, friendship, grudges and the talk about you are each a thread."
                : "The Hanging of Ashcombe: a long embroidery of a village, its people moving, working and talking. A list of the people in view, and a written account of what is happening, are available below."
            }
          />
        </div>
        <canvas ref={lens} className="lens" aria-hidden="true" />
        <div ref={you} className="you-tag" aria-hidden="true">
          <span>you</span>
        </div>
        <div ref={name} className="name-tag" aria-hidden="true">
          <NameTagText />
        </div>
        <div ref={hover} className="name-tag name-tag--hover" aria-hidden="true" />
        <Captions refs={captions} />
        <BorderText />
        {!ready && <Threading />}
        {children}
      </section>
    </div>
  );
}

function NameTagText() {
  const bio = useUi((s) => s.bio);
  return <>{bio?.name ?? ""}</>;
}

function Threading() {
  return (
    <p className="threading" role="status">
      Threading the needle
    </p>
  );
}

function WallLabel({ wallRef }: { wallRef: React.RefObject<HTMLDivElement | null> }) {
  const firstVisit = useUi((s) => s.firstVisit);
  const ready = useUi((s) => s.ready);
  const absence = useUi((s) => s.absence);
  const stage = useStage();
  const returning = ready && !firstVisit;
  const note = returning ? FRAMING_RETURN : FRAMING;
  return (
    <div ref={wallRef} className="wall-label">
      <h1 id="title" className="title">
        <span className="sr-only">The Unfinished Tapestry</span>
        <StitchedText text="THE UNFINISHED TAPESTRY" width={300} height={78} lines={2} className="title-thread" />
      </h1>
      <p className="subtitle">The Hanging of Ashcombe, begun in the year 1382 and still being stitched</p>
      <div className="keeper">
        {note.map((p, i) => (
          <p key={p} className={i === 0 ? "keeper-lede" : undefined}>
            {p}
          </p>
        ))}
        <p className="keeper-sign">{KEEPER}</p>
        {absence && (
          <button type="button" className="text-button" onClick={() => stage?.store.set({ returnOpen: true })}>
            What happened while you were away
          </button>
        )}
      </div>
    </div>
  );
}

/** What the upper border says, for screen readers: the Latin, and its English. */
function BorderText() {
  const captions = useUi((s) => s.captions);
  return (
    <section className="sr-only" aria-label="The inscriptions along the top of the hanging">
      <ul>
        {captions
          .filter((c) => c.la)
          .map((c) => (
            <li key={c.slot}>
              <span lang="la">{c.la.toLowerCase()}</span>: {c.en}.
            </li>
          ))}
      </ul>
    </section>
  );
}

function Captions({ refs }: { refs: React.RefObject<(HTMLElement | null)[]> }) {
  const captions = useUi((s) => s.captions);
  const mobile = useUi((s) => s.mobile);
  return (
    <div className={mobile ? "captions captions--mobile" : "captions"} aria-hidden={mobile ? undefined : true}>
      {captions.map((c, i) => (
        <p
          key={c.slot}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="caption"
          data-current="0"
        >
          {mobile && (
            <span className="caption-la" lang="la">
              {c.la.toLowerCase()}
            </span>
          )}
          <span className="caption-en">{c.en}</span>
        </p>
      ))}
    </div>
  );
}
