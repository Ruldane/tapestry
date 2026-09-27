"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Stage } from "@/client/stage";
import { Store, initialUi, useStoreValue, type UiState } from "@/client/store";

const Ctx = createContext<Stage | null>(null);
const idle = new Store<UiState>(initialUi);

/**
 * One Stage (one village worker, one loom worker) per mounted page. Each
 * effect run makes its own and disposes it on cleanup, so React StrictMode's
 * double mount never leaves a second worker running.
 */
export function StageProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage | null>(null);
  useEffect(() => {
    const s = new Stage();
    s.start();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the instance must exist before children can attach to it
    setStage(s);
    return () => {
      s.dispose();
      setStage(null);
    };
  }, []);
  return <Ctx.Provider value={stage}>{children}</Ctx.Provider>;
}

export function useStage(): Stage | null {
  return useContext(Ctx);
}

export function useUi<R>(select: (s: UiState) => R): R {
  const stage = useContext(Ctx);
  return useStoreValue(stage?.store ?? idle, select);
}
