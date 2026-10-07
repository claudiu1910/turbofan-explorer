import { DURATION, MARKERS, TICKS } from './config.js';
import { cameraAt } from './timeline.js';
import { fillTourView } from './tourview.js';
import { AIRCRAFT_DURATION, AIRCRAFT_MARKERS, AIRCRAFT_TICKS, fillAircraftView, aircraftCameraAt } from './aircraftFilm.js';

/**
 * A film is a scripted sequence: everything on screen is a pure function of its time `t`.
 * The Watch mode plays one against the clock; the story scrolls through them.
 *
 *   fill(view, t)    pose the scene for time t; returns { s, engine } (script state, engine numbers)
 *   camera(t, out)   where the camera is at time t
 */
export const FILMS = {
  engine: {
    id: 'engine',
    name: 'The engine',
    duration: DURATION,
    markers: MARKERS,
    ticks: TICKS,
    fill: fillTourView,
    camera: cameraAt,
  },
  aircraft: {
    id: 'aircraft',
    name: 'The aircraft',
    duration: AIRCRAFT_DURATION,
    markers: AIRCRAFT_MARKERS,
    ticks: AIRCRAFT_TICKS,
    fill: fillAircraftView,
    camera: aircraftCameraAt,
  },
};

export const FILM_LIST = Object.values(FILMS);
