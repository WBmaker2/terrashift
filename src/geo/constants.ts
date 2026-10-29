export const EARTH_RADIUS_KM = 6371;
export const MAX_TIME_MYR = 200;
export const TIME_STEP_MYR = 1;
export const KEYFRAME_INTERVAL_MYR = 5;

export const TERRAIN_LAT_SEGMENTS = 96;
export const TERRAIN_LON_SEGMENTS = 192;
export const TERRAIN_ROWS = TERRAIN_LAT_SEGMENTS + 1;
export const TERRAIN_COLS = TERRAIN_LON_SEGMENTS;
export const VISUAL_HEIGHT_EXAGGERATION = 40;

export const MIN_RELATIVE_SPEED = 0.2;
export const CONVERGENCE_THRESHOLD = 0.8;
export const TRANSFORM_RATIO = 1.2;

export const EVENT_SEED = 20261028;
export const MAX_VISIBLE_EARTHQUAKES = 300;
export const MAX_VISIBLE_VOLCANOES = 120;
export const EVENT_WINDOW_MYR = 2;

export const RASTER_LON_STEPS = 360;
export const RASTER_LAT_STEPS = 180;

export const PLAYBACK_SPEEDS = [0.5, 1, 5, 20] as const;

export const KEYFRAME_COUNT = MAX_TIME_MYR / KEYFRAME_INTERVAL_MYR + 1;
