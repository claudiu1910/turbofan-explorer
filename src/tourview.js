import { stateAt } from './timeline.js';
import { engineAt } from './model.js';
import { restAirframe } from './aircraftFilm.js';

/**
 * Pose the scene for tour time `t`. The tour is a pure function of time, so every field is set
 * outright (no easing): scrubbing, and scrolling on the story page, stay exact.
 * Returns the tour state and the engine numbers that go with it.
 */
export function fillTourView(view, t) {
  const s = stateAt(t);
  restAirframe(view); // clean and in cruise: this film is about the one engine
  view.cutConst = s.cutConst;
  view.explode = s.explode;
  view.offsets = null;
  view.hidden = null;
  view.flow = s.flow;
  Object.assign(view.phase, s.phase);
  view.stageWeights = s.stageWeights;
  view.hot = s.hot;
  view.fxBang = s.phase.bang;
  view.fxBlow = s.phase.blow;
  view.thrustAlpha = s.thrustAlpha;
  view.ambient = 0.38 * (1 - 0.8 * s.cutProgress);

  const engine = engineAt(s.run);
  view.lpRate = 0.3 + 0.9 * engine.n1f;
  view.hpRate = 0.3 + 0.9 * engine.n2f;
  view.flowSpeed = 0.55 + 0.6 * s.run;

  view.labelT = t;
  view.hpcT = s.hpcT;
  view.hpcPR = s.hpcPR;
  view.gasT = s.gasT;
  return { s, engine };
}
