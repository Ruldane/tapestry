"use client";

import { useEffect, useRef } from "react";
import { useStage, useUi } from "./StageProvider";
import { CHRONICLE_SLOTS, SCENES } from "@/sim/geography";

// ---------------------------------------------------------------------------
// A villager's biography
// ---------------------------------------------------------------------------

export function Biography() {
  const stage = useStage();
  const selected = useUi((s) => s.selected);
  const bio = useUi((s) => s.bio);
  const follow = useUi((s) => s.follow);
  const still = useUi((s) => s.still || s.systemReduced);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownFor = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (bio && shownFor.current !== bio.id) {
      if (shownFor.current === null && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) opener.current = document.activeElement;
      shownFor.current = bio.id;
      heading.current?.focus({ preventScroll: true });
    }
    if (!bio) shownFor.current = null;
  }, [bio]);

  if (selected === null) return null;
  const close = () => {
    stage?.select(null);
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };
  return (
    <aside className="bio" aria-labelledby="bio-name" onKeyDown={(e) => e.key === "Escape" && close()}>
      {!bio ? (
        <p className="bio-loading">Reading the stitches</p>
      ) : (
        <>
          <header className="bio-head">
            <p className="bio-latin" lang="la" aria-hidden="true">
              {bio.latin}
            </p>
            <h2 id="bio-name" ref={heading} tabIndex={-1}>
              {bio.name}
            </h2>
            <p className="bio-meta">
              {[bio.title, bio.age].filter(Boolean).join(", ")}
              {bio.household ? <span className="bio-house">. Of {bio.household}</span> : null}
            </p>
          </header>
          <p className="bio-now">
            <span className="bio-label">Now</span> {bio.doing}
            {bio.alive ? <>, at {bio.scene.replace(/^The /, "the ")}</> : null}.
          </p>
          <div className="bio-lines">
            {bio.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p className="bio-stranger">{bio.stranger}</p>
          </div>
          {(bio.kin.length > 0 || bio.friends.length > 0 || bio.grudges.length > 0) && (
            <dl className="bio-ties">
              {bio.kin.length > 0 && (
                <>
                  <dt>Kin</dt>
                  <dd>
                    {bio.kin.map((k, i) => (
                      <span key={k.id}>
                        <button type="button" className="text-button" onClick={() => stage?.select(k.id)}>
                          {k.name}
                        </button>{" "}
                        <span className="bio-rel">({k.relation})</span>
                        {i < bio.kin.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {bio.friends.length > 0 && (
                <>
                  <dt>Friends</dt>
                  <dd>
                    {bio.friends.map((k, i) => (
                      <span key={k.id}>
                        <button type="button" className="text-button" onClick={() => stage?.select(k.id)}>
                          {k.name}
                        </button>
                        {i < bio.friends.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {bio.grudges.length > 0 && (
                <>
                  <dt>Grudges</dt>
                  <dd>
                    {bio.grudges.map((k, i) => (
                      <span key={k.id}>
                        <button type="button" className="text-button" onClick={() => stage?.select(k.id)}>
                          {k.name}
                        </button>{" "}
                        <span className="bio-rel">over {k.over}</span>
                        {i < bio.grudges.length - 1 ? "; " : ""}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          )}
          {bio.says.length > 0 && (
            <div className="bio-says">
              <p className="bio-label">Has heard say</p>
              <ul>
                {bio.says.map((s) => (
                  <li key={s}>{s.charAt(0).toUpperCase() + s.slice(1)}.</li>
                ))}
              </ul>
            </div>
          )}
          <div className="bio-actions">
            {bio.alive && (
              <button type="button" className="tool" aria-pressed={follow} onClick={() => stage?.follow(!follow)}>
                {follow ? "Stop following" : still ? "Keep them in view" : "Follow along the cloth"}
              </button>
            )}
            <button type="button" className="tool" onClick={close}>
              Put them down
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// What is happening now
// ---------------------------------------------------------------------------

export function SummaryDialog() {
  const stage = useStage();
  const open = useUi((s) => s.summaryOpen);
  const lines = useUi((s) => s.summary);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="now-h" onClose={() => stage?.store.set({ summaryOpen: false })}>
      <h2 id="now-h">What is happening in Ashcombe now</h2>
      <div aria-live="polite">
        {lines ? lines.map((l) => <p key={l}>{l}</p>) : <p>Looking along the cloth</p>}
      </div>
      <form method="dialog" className="sheet-actions">
        <button type="button" className="tool" onClick={() => stage?.openSummary()}>
          Look again
        </button>
        <button className="tool">Close</button>
      </form>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// While you were away
// ---------------------------------------------------------------------------

export function ReturnNote() {
  const stage = useStage();
  const open = useUi((s) => s.returnOpen);
  const absence = useUi((s) => s.absence);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && absence && !d.open) d.showModal();
    if ((!open || !absence) && d.open) d.close();
  }, [open, absence]);
  if (!absence) return null;
  const scene = stage?.client.scene;
  const fresh = (scene?.chronicle ?? []).filter((c) => c.away === absence.id && c.slot >= 0);
  const scenes = [...new Set(fresh.map((c) => c.scene))];
  return (
    <dialog ref={ref} className="sheet sheet--return" aria-labelledby="away-h" onClose={() => stage?.store.set({ returnOpen: false })}>
      <p className="sheet-kicker">A note from the keeper</p>
      <h2 id="away-h">While you were away</h2>
      <p lang="la" className="sheet-latin">
        {absence.la.toLowerCase()}
      </p>
      <p>{absence.note}</p>
      {scenes.length > 0 && (
        <>
          <p>The needle has stitched it into the lower border. New work is under:</p>
          <ul className="sheet-places">
            {scenes.map((id) => {
              const s = SCENES.find((x) => x.id === id);
              if (!s) return null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      stage?.store.set({ returnOpen: false });
                      const slot = fresh.find((c) => c.scene === id);
                      const cs = slot ? CHRONICLE_SLOTS[slot.slot] : null;
                      stage?.walkTo(cs ? (cs.x0 + cs.x1) / 2 : (s.x0 + s.x1) / 2);
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <form method="dialog" className="sheet-actions">
        <button className="tool">Go back to the hanging</button>
      </form>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// The back of the cloth
// ---------------------------------------------------------------------------

export function ReverseLegend() {
  const back = useUi((s) => s.back);
  const stage = useStage();
  if (!back) return null;
  return (
    <div className="legend" role="note" aria-label="Threads on the back of the cloth">
      <p className="legend-title">The back of the cloth</p>
      <p className="legend-text">Every thread here is a tie in the village as it stands. Pick a figure to see only theirs.</p>
      <ul>
        <li>
          <span className="swatch swatch--kin" aria-hidden="true" /> kin
        </li>
        <li>
          <span className="swatch swatch--spouse" aria-hidden="true" /> husband and wife
        </li>
        <li>
          <span className="swatch swatch--love" aria-hidden="true" /> walking out
        </li>
        <li>
          <span className="swatch swatch--friend" aria-hidden="true" /> friends
        </li>
        <li>
          <span className="swatch swatch--grudge" aria-hidden="true" /> a grudge, knotted
        </li>
        <li>
          <span className="swatch swatch--gossip" aria-hidden="true" /> talk of you, passed along
        </li>
      </ul>
      <button type="button" className="tool" onClick={() => stage?.toggleBack()}>
        Turn it back
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narration for screen readers, and a debug readout
// ---------------------------------------------------------------------------

export function LiveNarration() {
  const announce = useUi((s) => s.announce);
  const narrate = useUi((s) => s.narrate);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {narrate ? announce : ""}
    </div>
  );
}

export function DebugReadout() {
  const debug = useUi((s) => s.debug);
  const perf = useUi((s) => s.perf);
  if (!debug) return null;
  return (
    <p className="debug" aria-hidden="true">
      {perf.fps} fps, p90 {perf.p90} ms, tier {perf.tier}, {perf.figures} drawn, step {perf.msPerStep} ms, tiles {perf.tiles}, pending {perf.pending}
    </p>
  );
}

export function LensHint() {
  const lens = useUi((s) => s.lens);
  const stage = useStage();
  if (!lens) return null;
  return (
    <div
      className="lens-hint"
      role="note"
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 12;
        if (e.key === "ArrowUp") stage?.moveLens(0, -step);
        else if (e.key === "ArrowDown") stage?.moveLens(0, step);
        else if (e.key === "ArrowLeft") stage?.moveLens(-step, 0);
        else if (e.key === "ArrowRight") stage?.moveLens(step, 0);
        else if (e.key === "Escape") stage?.toggleLens();
        else return;
        e.preventDefault();
      }}
    >
      The glass shows the weave and every stitch. Move it with the pointer, or focus here and use the arrow keys.
    </div>
  );
}

export function ErrorNote() {
  const error = useUi((s) => s.error);
  if (!error) return null;
  return (
    <p className="error-note" role="alert">
      The needle has snagged: {error} Reloading the page will pick it up again.
    </p>
  );
}
