// Render layers used by post.js.
// BASE    lit geometry; receives shadows and ambient occlusion.
// OVERLAY drawn after AO: orange section faces, airflow, glows, plume (they stay flat and bright).
// HAZE    only feeds the heat-haze distortion buffer; never drawn as colour.
export const LAYER = { BASE: 0, OVERLAY: 1, HAZE: 2 };
