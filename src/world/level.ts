import { buildConstruction } from './maps/construction';
import { buildFactory } from './maps/factory';
import { buildPlayground } from './maps/playground';
import { buildRooftops } from './maps/rooftops';
import { buildTreetops } from './maps/treetops';
import type { Level, MapId } from './builder';

export { colorMaterial, styleMaterial } from './builder';
export type { Level, MapId, Style, Trigger } from './builder';

export interface MapInfo {
  id: MapId;
  name: string;
  /** Native look: ink maps are ballpoint-only, color maps are painted. */
  look: 'ink' | 'color';
  /** One line about its parkour. */
  blurb: string;
  build: () => Level;
}

export const MAPS: MapInfo[] = [
  { id: 'construction', name: 'Construction Site', look: 'ink', blurb: 'the original: scaffold floors, a rooftop and a crane', build: buildConstruction },
  { id: 'rooftops', name: 'Rooftops', look: 'ink', blurb: 'roof gaps, launch vents and slide-under ducts', build: buildRooftops },
  { id: 'factory', name: 'Factory', look: 'ink', blurb: 'conveyor belts, steam vents and a catwalk loop', build: buildFactory },
  { id: 'playground', name: 'Playground', look: 'color', blurb: 'trampolines, tube tunnels and a climbing fort', build: buildPlayground },
  { id: 'treetops', name: 'Treetops', look: 'color', blurb: 'bounce mushrooms, rope bridges and leaf updrafts', build: buildTreetops },
];

export function mapInfo(id: string): MapInfo {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function buildLevel(id: MapId = 'construction'): Level {
  return mapInfo(id).build();
}
