// Colour schemes. `pattern`: 0 = tabby stripes, 1 = plain, 2 = spots, 3 = saddle (beagle).
export const COATS = {
  cat: {
    ginger: { base: '#f2a04a', stripe: '#d4742a', white: '#fff4e2', pattern: 0, whiteAmount: 1, ear: '#ffb3a8', eye: ['#7bd66a', '#2f7a3a'], shadow: '#c9a0b8', outline: '#4a2210', nose: '#ff8f9e' },
    tabby: { base: '#a98562', stripe: '#4b3526', white: '#f5efe6', pattern: 0, whiteAmount: 1, ear: '#f2b6ac', eye: ['#d6d14a', '#6b7a14'], shadow: '#a893b5', outline: '#2c1b12', nose: '#f08c96' },
    grey: { base: '#9aa3b2', stripe: '#5a6373', white: '#f2f4f8', pattern: 0, whiteAmount: 1, ear: '#f4b8c0', eye: ['#ffd24a', '#b9822a'], shadow: '#9a8cc0', outline: '#272c38', nose: '#f59aa8' },
    black: { base: '#3a3744', stripe: '#2a2832', white: '#ffffff', pattern: 1, whiteAmount: 0, ear: '#7a5c68', eye: ['#ffd84a', '#c48a1a'], shadow: '#5a4f80', outline: '#0e0c12', nose: '#c07a8a' },
    tuxedo: { base: '#3a3744', stripe: '#2a2832', white: '#fffaf2', pattern: 1, whiteAmount: 1, ear: '#e7aab0', eye: ['#8fe07a', '#2f8a3a'], shadow: '#6a5f92', outline: '#0e0c12', nose: '#f59aa8' },
    cream: { base: '#f3dcb2', stripe: '#d9b27a', white: '#fffaf0', pattern: 0, strength: 0.7, whiteAmount: 1, ear: '#ffbdb2', eye: ['#7ec8ee', '#2a6aa0'], shadow: '#cfa8c0', outline: '#5a3a22', nose: '#ff9aa6' },
  },
  dog: {
    golden: { base: '#e3a64f', stripe: '#c98a38', white: '#f7e8c8', pattern: 1, whiteAmount: 0.8, ear: '#c98a38', earOuter: '#c4812f', eye: ['#7a4a22', '#3a2010'], shadow: '#c9a0b0', outline: '#4a2a10', nose: '#2a1a1c', blaze: 0 },
    beagle: { base: '#fff6e8', stripe: '#2c1d16', white: '#fff6e8', pattern: 3, whiteAmount: 1, ear: '#a85f28', earOuter: '#a85f28', head: '#b9702f', eye: ['#7a4a22', '#3a2010'], shadow: '#b9a4c0', outline: '#3a2012', nose: '#241618', blaze: 1 },
    dalmatian: { base: '#fffaf2', stripe: '#1f1c24', white: '#fffaf2', pattern: 2, whiteAmount: 1, ear: '#2a2630', earOuter: '#2a2630', eye: ['#7a4a22', '#3a2010'], shadow: '#b8accb', outline: '#2a2630', nose: '#1b1618', blaze: 0 },
    black: { base: '#3b3945', stripe: '#2b2933', white: '#6a6674', pattern: 1, whiteAmount: 0.25, ear: '#2f2d38', earOuter: '#2f2d38', eye: ['#8a5428', '#3a2010'], shadow: '#5d5486', outline: '#0e0c12', nose: '#141014', blaze: 0 },
    corgi: { base: '#e98f3e', stripe: '#d27624', white: '#fff4e2', pattern: 1, whiteAmount: 1, ear: '#e98f3e', earOuter: '#df8434', eye: ['#7a4a22', '#3a2010'], shadow: '#c9a0b0', outline: '#4e2810', nose: '#221618', blaze: 1 },
  },
};
