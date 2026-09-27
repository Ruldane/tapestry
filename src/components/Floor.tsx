"use client";

import { useState } from "react";
import { useStage, useUi } from "./StageProvider";
import { SCENES } from "@/sim/geography";

/**
 * The floor of the hall below the hanging: the controls, and the selvedge
 * (a woven strip that shows the whole length of the cloth and where you are
 * along it, and takes you to any scene).
 */
export function Floor() {
  return (
    <div className="floor">
      <Controls />
      <Selvedge />
    </div>
  );
}

function Controls() {
  const stage = useStage();
  const paused = useUi((s) => s.paused);
  const speed = useUi((s) => s.speed);
  const lens = useUi((s) => s.lens);
  const back = useUi((s) => s.back);
  const ahead = useUi((s) => s.ahead);
  const mobile = useUi((s) => s.mobile);
  const [more, setMore] = useState(false);
  const hastened = speed > 1;
  return (
    <div className="controls" role="group" aria-label="The needle and the cloth">
      <div className="controls-time">
        <button type="button" className="needle-button" aria-pressed={paused} onClick={() => stage?.togglePause()}>
          <span className="needle-glyph" aria-hidden="true" />
          <span className="needle-label">{paused ? "The needle is stayed" : "Stay the needle"}</span>
          <span className="needle-hint">{paused ? "Let it run again" : "Stops all movement"}</span>
        </button>
        <button type="button" className="tool" aria-pressed={hastened} onClick={() => stage?.toggleHasten()} disabled={paused}>
          Hasten
        </button>
        {hastened && ahead > 55 * 60_000 && (
          <span className="tool-note" role="status">
            An hour ahead of your clock; it waits for you now.
          </span>
        )}
      </div>
      {mobile && (
        <button type="button" className="tool tool--more" aria-expanded={more} aria-controls="tools" onClick={() => setMore(!more)}>
          {more ? "Close" : "More"}
        </button>
      )}
      <div className="controls-tools" id="tools" data-open={more ? "1" : "0"}>
        <button
          type="button"
          className="tool"
          aria-pressed={lens}
          onClick={() => {
            stage?.toggleLens();
            setMore(false);
          }}
        >
          Look closely
        </button>
        <button
          type="button"
          className="tool"
          aria-pressed={back}
          onClick={() => {
            stage?.toggleBack();
            setMore(false);
          }}
        >
          Turn the cloth
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => {
            stage?.openSummary();
            setMore(false);
          }}
          aria-haspopup="dialog"
        >
          What is happening now?
        </button>
        <a className="tool" href="#roll" onClick={() => setMore(false)}>
          Parish roll
        </a>
      </div>
      <InView />
    </div>
  );
}

function Selvedge() {
  const stage = useStage();
  const scene = useUi((s) => s.scene);
  return (
    <nav className="selvedge" aria-label="Along the hanging">
      <div className="selvedge-track">
        <div className="selvedge-window" data-selvedge-window aria-hidden="true" />
        <div className="selvedge-mark selvedge-mark--stranger" data-selvedge-stranger aria-hidden="true" />
        <div className="selvedge-mark selvedge-mark--selected" data-selvedge-selected aria-hidden="true" />
        <ol className="selvedge-scenes">
          {SCENES.map((s) => (
            <li key={s.id} style={{ flexGrow: s.x1 - s.x0 }}>
              <button type="button" className="selvedge-scene" aria-label={s.name} aria-current={scene === s.name ? "location" : undefined} onClick={() => stage?.walkToScene(s.id)}>
                <span className="selvedge-long" aria-hidden="true">
                  {cap(s.name.replace(/^The /, ""))}
                </span>
                <span className="selvedge-short" aria-hidden="true">
                  {SHORT[s.id]}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const SHORT: Record<string, string> = { forest: "Wood", fields: "Fields", river: "Mill", green: "Green", manor: "Manor", common: "Fold", end: "End" };

function InView() {
  const stage = useStage();
  const people = useUi((s) => s.inView);
  const selected = useUi((s) => s.selected);
  return (
    <nav className="in-view" aria-label="People in view">
      <p className="in-view-title">People in view</p>
      {people.length === 0 ? (
        <p className="in-view-empty">Nobody is about here just now.</p>
      ) : (
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={selected === p.id} onClick={() => stage?.select(p.id)}>
                {p.name}, {p.doing}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
