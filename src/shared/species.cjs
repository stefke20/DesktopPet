'use strict';
// Per-species runtime data shared by the tray menu (main process), the renderer and the simulation.
const SPECIES = {
  cat: {
    id: 'cat', label: 'Cat', scale: 1.0, defaultCoat: 'ginger',
    coats: [['ginger', 'Ginger tabby'], ['tabby', 'Brown tabby'], ['grey', 'Grey tabby'], ['black', 'Black cat'], ['tuxedo', 'Tuxedo'], ['cream', 'Cream']],
    traits: { maxRise: 1.45, climbs: true, walk: 0.75, run: 2.1, climb: 0.55, perchWeight: 1.0, napsOnPerch: true, sound: 'meow', playful: 1 },
  },
  dog: {
    id: 'dog', label: 'Dog', scale: 1.12, defaultCoat: 'golden',
    coats: [['golden', 'Golden retriever'], ['beagle', 'Beagle'], ['dalmatian', 'Dalmatian'], ['black', 'Black lab'], ['corgi', 'Corgi']],
    // dogs can't climb walls and only hop onto low ledges
    traits: { maxRise: 0.78, climbs: false, walk: 0.85, run: 2.5, climb: 0, perchWeight: 0.35, napsOnPerch: false, sound: 'bark', playful: 1.3 },
  },
};
module.exports = { SPECIES, SPECIES_IDS: Object.keys(SPECIES) };
