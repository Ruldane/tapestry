"use client";

import { useEffect, useRef, useState } from "react";
import { useStage, useUi } from "./StageProvider";
import { durationWords } from "@/text/keeper";

/**
 * The parish roll: the register kept below the hanging. Households, the
 * christenings, weddings and burials, the harvest and the stores, the
 * beasts, and what the village makes of you. Live while it is on screen.
 */
export function ParishRoll() {
  const stage = useStage();
  const roll = useUi((s) => s.roll);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stage) return;
    const io = new IntersectionObserver((entries) => stage.client.roll(entries.some((e) => e.isIntersecting)), { rootMargin: "200px" });
    io.observe(el);
    return () => {
      io.disconnect();
      stage.client.roll(false);
    };
  }, [stage]);

  return (
    <section ref={ref} className="roll" id="roll" aria-labelledby="roll-h" tabIndex={-1}>
      <header className="roll-head">
        <h2 id="roll-h">The parish roll</h2>
        <p className="roll-when">{roll ? `As it stands ${roll.when}.` : "Opening the roll."}</p>
      </header>
      {roll && (
        <div className="roll-body">
          <div className="roll-figures">
            <p>
              <span className="roll-num">{roll.population}</span> souls
            </p>
            <p>
              <span className="roll-num">{roll.households.length}</span> households
            </p>
            <p>
              The month of <strong>{roll.labour}</strong>
            </p>
            <p>The river is {roll.river}</p>
          </div>

          <div className="roll-cols">
            <div>
              <h3>Households</h3>
              <table className="register">
                <caption className="sr-only">Households of Ashcombe, their people and their stores</caption>
                <thead>
                  <tr>
                    <th scope="col">House</th>
                    <th scope="col">Who</th>
                    <th scope="col" className="num">
                      Grain
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roll.households.map((h) => (
                    <tr key={h.id} data-short={h.short ? "1" : undefined}>
                      <th scope="row">
                        {h.name}
                        <span className="register-sub">{h.scene}</span>
                      </th>
                      <td>
                        {h.members.map((m, i) => (
                          <span key={m.id} className="register-person">
                            <button type="button" className="text-button" onClick={() => stage?.select(m.id)}>
                              {m.name}
                            </button>
                            <span className="register-sub">
                              {" "}
                              {m.age}
                              {m.trade ? `, ${m.trade}` : ""}
                              {m.note ? `, ${m.note}` : ""}
                            </span>
                            {i < h.members.length - 1 ? "; " : ""}
                          </span>
                        ))}
                      </td>
                      <td className="num">{h.short ? "none" : `${h.grain} bu.`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Christenings</h3>
              {roll.births.length ? (
                <table className="register">
                  <caption className="sr-only">Children born since the hanging was begun</caption>
                  <thead>
                    <tr>
                      <th scope="col">Child</th>
                      <th scope="col">Parents</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roll.births.slice(0, 12).map((b) => (
                      <tr key={b.id}>
                        <th scope="row">{b.name}</th>
                        <td>{b.parents}</td>
                        <td>{b.t}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="register-empty">No child has been born since the hanging was begun. There are women with child.</p>
              )}

              <h3>Weddings</h3>
              {roll.marriages.length ? (
                <table className="register">
                  <caption className="sr-only">Weddings</caption>
                  <thead>
                    <tr>
                      <th scope="col">Husband</th>
                      <th scope="col">Wife</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roll.marriages.slice(0, 10).map((m, i) => (
                      <tr key={`${m.a}${i}`}>
                        <th scope="row">{m.a}</th>
                        <td>{m.b}</td>
                        <td>{m.t}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="register-empty">No weddings yet. Some are walking out.</p>
              )}

              <h3>Burials</h3>
              <table className="register">
                <caption className="sr-only">Burials in the churchyard</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col" className="num">
                      Age
                    </th>
                    <th scope="col">When, and of what</th>
                  </tr>
                </thead>
                <tbody>
                  {roll.burials.slice(0, 12).map((b) => (
                    <tr key={b.id}>
                      <th scope="row">{b.name}</th>
                      <td className="num">{b.age}</td>
                      <td>
                        {b.t}
                        {b.cause ? `, ${b.cause}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Fields, harvest and stores</h3>
              <table className="register">
                <caption className="sr-only">The fields, the harvest, the stores and the beasts</caption>
                <tbody>
                  {roll.fields.map((f) => (
                    <tr key={f.name}>
                      <th scope="row">{f.name}</th>
                      <td>{f.state}</td>
                    </tr>
                  ))}
                  {roll.harvest && (
                    <tr>
                      <th scope="row">Last harvest</th>
                      <td>
                        {roll.harvest.quality}
                        {roll.harvest.gathered ? `, ${roll.harvest.gathered} bushels gathered` : ""}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">In the houses</th>
                    <td>{roll.stores.households} bushels</td>
                  </tr>
                  <tr>
                    <th scope="row">In the manor barn</th>
                    <td>{roll.stores.manor} bushels</td>
                  </tr>
                  <tr>
                    <th scope="row">Tithe barn</th>
                    <td>{roll.stores.church} bushels</td>
                  </tr>
                  <tr>
                    <th scope="row">Bread in hand</th>
                    <td>about {roll.stores.weeks} weeks for everyone</td>
                  </tr>
                  <tr>
                    <th scope="row">Beasts</th>
                    <td>
                      {roll.beasts.sheep} sheep{roll.beasts.lambs ? ` and ${roll.beasts.lambs} lambs` : ""}, {roll.beasts.geese} geese, {roll.beasts.pigs} pigs, {roll.beasts.oxen} oxen, {roll.beasts.dogs} dogs
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3>The stranger</h3>
              <table className="register">
                <caption className="sr-only">What the village makes of you</caption>
                <tbody>
                  <tr>
                    <th scope="row">Visits</th>
                    <td>{roll.stranger.visits}</td>
                  </tr>
                  <tr>
                    <th scope="row">Have seen you</th>
                    <td>{roll.stranger.met}</td>
                  </tr>
                  <tr>
                    <th scope="row">Have heard of you</th>
                    <td>{roll.stranger.heard}</td>
                  </tr>
                  <tr>
                    <th scope="row">Think well of you</th>
                    <td>{roll.stranger.fond}</td>
                  </tr>
                  <tr>
                    <th scope="row">Are wary of you</th>
                    <td>{roll.stranger.wary}</td>
                  </tr>
                </tbody>
              </table>
              <Visits />
            </div>
          </div>
          <LowerBorder />
          <Stitched />
        </div>
      )}
    </section>
  );
}

function Visits() {
  const absences = useUi((s) => s.absences);
  if (!absences.length) return null;
  return (
    <>
      <h3>While you were away</h3>
      <ol className="absences">
        {absences
          .slice()
          .reverse()
          .slice(0, 6)
          .map((a) => (
            <li key={a.id}>
              <p className="absence-when">Away {durationWords(a.elapsedMs)}</p>
              <p>{a.en}</p>
            </li>
          ))}
      </ol>
    </>
  );
}

function LowerBorder() {
  const chronicle = useUi((s) => s.chronicle);
  if (!chronicle.length) return null;
  return (
    <div className="lower-border">
      <h3>The lower border</h3>
      <table className="register">
        <caption className="sr-only">The chronicle stitched along the bottom of the hanging, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Stitched</th>
            <th scope="col">In English</th>
            <th scope="col">Under</th>
          </tr>
        </thead>
        <tbody>
          {chronicle.slice(0, 24).map((c) => (
            <tr key={c.id}>
              <th scope="row" lang="la" className="register-latin">
                {c.la.toLowerCase()}
              </th>
              <td>
                {c.en}
                {c.away ? <span className="register-sub"> (while you were away)</span> : null}
              </td>
              <td>{c.scene}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stitched() {
  const narrations = useUi((s) => s.narrations);
  return (
    <div className="stitched-today">
      <h3>Stitched since you came</h3>
      {narrations.length ? (
        <ol>
          {narrations.slice(0, 14).map((n) => (
            <li key={n.id}>{n.text}</li>
          ))}
        </ol>
      ) : (
        <p className="register-empty">Nothing yet worth a stitch. It will come; it always does.</p>
      )}
    </div>
  );
}

export function Colophon() {
  const stage = useStage();
  const still = useUi((s) => s.still);
  const systemReduced = useUi((s) => s.systemReduced);
  const narrate = useUi((s) => s.narrate);
  const [confirm, setConfirm] = useState(false);
  return (
    <footer className="colophon">
      <div className="colophon-settings" role="group" aria-label="For the observer">
        <h2 className="colophon-h">For the observer</h2>
        <label className="check">
          <input type="checkbox" checked={still} onChange={(e) => stage?.setStill(e.target.checked)} />
          <span>
            Still pictures
            <span className="check-sub">{systemReduced ? "Your device asks for less motion, so this is on." : "The village lives on; the cloth shows a new picture every few seconds."}</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={narrate} onChange={(e) => stage?.setNarrate(e.target.checked)} />
          <span>
            Tell me what happens
            <span className="check-sub">A quiet spoken note, now and then, for screen readers.</span>
          </span>
        </label>
        {!confirm ? (
          <button type="button" className="text-button" onClick={() => setConfirm(true)}>
            Begin a new hanging
          </button>
        ) : (
          <p className="confirm">
            Ashcombe and everyone in it will be unpicked, and a new village begun.{" "}
            <button
              type="button"
              className="tool"
              onClick={() => {
                stage?.client.reset();
                setConfirm(false);
                window.scrollTo({ top: 0 });
              }}
            >
              Unpick it all
            </button>{" "}
            <button type="button" className="text-button" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </p>
        )}
      </div>
      <div className="colophon-note">
        <p>
          Ashcombe, its people and its hanging are fiction. The village keeps your clock and your season, runs in your browser, and is kept only here, on this device. Nothing about you is used but the fact of your visits.
        </p>
        <p>The inscriptions are in plain Latin, glossed; the names are the kind a fourteenth-century village gave its children. Everything else is thread.</p>
      </div>
    </footer>
  );
}
