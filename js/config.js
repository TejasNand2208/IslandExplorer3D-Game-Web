// ---- Island Explorer 3D : global settings ----
export const WORLD_W = 400;          // island width in meters (height follows map aspect)
export const COLS = 220;             // terrain resolution (smoother = higher; lower for slower PCs, e.g. 160)
export const PLAYER_H = 1.8;         // player height in meters
export const FOREST_GREEN_MAX = 105; // lower = less forest detected from the map image

// Vismritnagar ellipse + castle position, in map UV (0..1, v measured from top)
export const CITY = { u: 0.618, v: 0.488, a: 0.135, b: 0.195, castleU: 0.604, castleV: 0.50 };
export const SPAWN_UV = { u: 0.618, v: 0.60 };

export const ISLAND_NAME = 'Samudragrah';

// kind: 'city' | 'castle' | 'mountain' | 'river' | 'town'   (u,v = position on the map, v measured from the top)
export const PLACES = [
  { id: 'Vismritnagar', kind: 'city', u: 0.618, v: 0.488, houses: 0, radius: 45, msg: 'Vismritnagar - the forgotten capital of Samudragrah. The harbor lies to the east.' },
  { id: 'Suryakot', kind: 'castle', u: 0.604, v: 0.50, houses: 0, radius: 24, msg: 'Suryakot - the sun fortress that guards the capital.' },
  { id: 'Pratham Post', kind: 'town', u: 0.366, v: 0.25, houses: 2, radius: 16, msg: 'Pratham Post - the first watch post, guarding the northern mountains.' },
  { id: 'Chhoti Basti', kind: 'town', u: 0.172, v: 0.45, houses: 5, radius: 16, msg: 'Chhoti Basti - a small settlement of lumberjacks. The forest is full of wood.' },
  { id: 'Samarpan', kind: 'town', u: 0.22, v: 0.72, houses: 3, radius: 16, msg: 'Samarpan - an old outpost on the western shore.' },
  { id: 'Madhuvan', kind: 'town', u: 0.572, v: 0.87, houses: 5, radius: 16, msg: 'Madhuvan - a quiet village by the southern bay, famed for its honey.' },
  { id: 'Madhyasth', kind: 'town', u: 0.828, v: 0.37, houses: 6, radius: 16, msg: 'Madhyasth - a busy trading town on the eastern coast.' },
  { id: 'Amritdhara', kind: 'river', u: 0.49, v: 0.28, houses: 0, radius: 16, msg: 'Amritdhara - the river of nectar that feeds the whole island.' },
  { id: 'Vajra Shikhar', kind: 'mountain', u: 0.50, v: 0.11, houses: 0, radius: 32, msg: '' },
];

export const OBJECTIVES = [
  { text: 'Gather Wood', kind: 'collect', item: 'Wood', amount: 5 },
  { text: 'Collect Stone', kind: 'collect', item: 'Stone', amount: 3 },
  { text: 'Pick Fruit', kind: 'collect', item: 'Fruit', amount: 3 },
  { text: 'Visit Pratham Post', kind: 'visit', place: 'Pratham Post' },
  { text: 'Visit Chhoti Basti', kind: 'visit', place: 'Chhoti Basti' },
  { text: 'Visit Samarpan', kind: 'visit', place: 'Samarpan' },
  { text: 'Visit Madhuvan', kind: 'visit', place: 'Madhuvan' },
  { text: 'Visit Madhyasth', kind: 'visit', place: 'Madhyasth' },
  { text: 'Follow the river Amritdhara', kind: 'visit', place: 'Amritdhara' },
  { text: 'Climb towards Vajra Shikhar', kind: 'visit', place: 'Vajra Shikhar' },
  { text: 'Reach the fortress Suryakot', kind: 'visit', place: 'Suryakot' },
  { text: 'Enter Vismritnagar', kind: 'visit', place: 'Vismritnagar' },
];

// Animation files in assets/anims/ (first name that exists is used)
export const ANIM_FILES = {
  idle: ['Aj_Standing_Idle', 'Idle', 'Standing Idle'],
  run: ['Aj_Fast_Run', 'Running', 'Run'],
  jump: ['Aj_Jump', 'Jump', 'Jumping'],
  turnLeft: ['Aj_Left_Turn', 'Left Turn'],
  turnRight: ['Aj_Right_Turn', 'Right Turn'],
};
