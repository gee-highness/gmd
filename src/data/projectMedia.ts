// src/data/projectMedia.ts
// Screenshots that exist in /public/projects. Add a file there, then list it here.
export interface ProjectMedia {
  desktop?: { src: string; width: number; height: number };
  mobile?: { src: string; width: number; height: number };
}

const d = (id: string, width = 1762, height = 879) => ({ src: `/projects/${id}.desktop.png`, width, height });
const m = (id: string, width = 462, height = 767) => ({ src: `/projects/${id}.mobile.png`, width, height });

export const projectMedia: Record<string, ProjectMedia> = {
  'servo-pos': { desktop: d('servo-pos'), mobile: m('servo-pos') },
  'venda-khona': { desktop: d('venda-khona'), mobile: m('venda-khona') },
  'gss-lms': { desktop: d('gss-lms'), mobile: m('gss-lms') },
  'v-me': { desktop: d('v-me'), mobile: m('v-me') },
  'g-solutions': { desktop: d('g-solutions'), mobile: m('g-solutions') },
  'eswatini-health-api': { desktop: d('eswatini-health-api') },
  'carte-pos': { desktop: d('carte-pos'), mobile: m('carte-pos') },
  'gatetrack-secure': { desktop: d('gatetrack-secure'), mobile: m('gatetrack-secure') },
  'dialysis-support-core': { desktop: d('dialysis-support-core'), mobile: m('dialysis-support-core') },
  'terra-finance': { desktop: d('terra-finance'), mobile: m('terra-finance') },
  fleetflow: { desktop: d('fleetflow'), mobile: m('fleetflow') },
  shesha: { desktop: d('shesha'), mobile: m('shesha') },
  'jarvis-assistant': { mobile: m('jarvis-assistant', 390, 844) },
  agtfieldcore: { mobile: m('agtfieldcore') },
  'nexacore-solutions': { mobile: m('nexacore-solutions') },
  'ecot-system': { mobile: m('ecot-system') },
  'triptych-tasks': { mobile: m('triptych-tasks') },
  'doctrack-pro': { mobile: m('doctrack-pro') },
  chairapp: { desktop: d('chairapp'), mobile: m('chairapp', 450, 877) },
  kimmys: { desktop: d('kimmys', 1761, 880), mobile: m('kimmys', 442, 878) },
  'house-viewer': { desktop: d('house-viewer'), mobile: m('house-viewer', 450, 877) },
};
