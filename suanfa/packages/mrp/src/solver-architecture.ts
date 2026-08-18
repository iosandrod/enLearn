import { SolverGuard } from "./solver-state.js";

/**
 * The native solver is organized as a sequence of propagation operators.
 * Keeping the phase boundary explicit makes retries and termination checks
 * observable without coupling the orchestration to APS model details.
 */
export type SolverPhaseName =
  | "load-confirmed"
  | "propagate-demand"
  | "propagate-buffer"
  | "propagate-resource";

export interface SolverPhase {
  readonly name: SolverPhaseName;
  readonly run: () => void;
}

export interface SolverPipelineResult {
  readonly completedPhases: number;
}

export function runSolverPipeline(
  guard: SolverGuard,
  phases: readonly SolverPhase[]
): SolverPipelineResult {
  let completedPhases = 0;
  for (const phase of phases) {
    guard.enter(`phase:${phase.name}:${completedPhases}`, () => {
      phase.run();
    });
    completedPhases += 1;
  }
  return { completedPhases };
}
