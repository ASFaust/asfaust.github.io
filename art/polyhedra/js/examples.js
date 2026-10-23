// The examples menu (U1): the owner's shapes from docs/catalogue.md, each a link (the part after
// '#') with the owner's short name for it. Keep it in step with the catalogue; tests/examples.mjs
// replays every link and checks the catalogue's numbers.

export const EXAMPLES = [
  ['Regular faces, then Flat faces', [
    ['very artsy', 'n=scnC&m=regular,flat'],
    ['very nice, complex', 'n=jtJ37&m=regular,flat'],
    ['inset squares', 'n=csJ45&m=regular,flat'],
    ['simple kites', 'n=oD&m=regular,flat'],
    ['boulder (smoke Pokémon)', 'n=okzD&m=regular,flat&e=0.2'],
    ['pyrite crystal', 'n=jcaJ29&m=regular,flat&e=0.2'],
    ['low-poly virus', 'n=ocI&m=regular/w,flat/w&e=0.2'],
    ['spinning top', 'n=jJ46&m=regular,flat&e=0.2'],
    ['dented sphere', 'n=josJ37&m=regular,flat&e=0.2'],
    ['disk with tube openings', 'n=okA7&m=regular,flat'],
    ['drum', 'n=pU5&m=regular/w,flat/w'],
    ['screw', 'n=ogdJ37&m=regular/w,flat/w&h=79&e=0.15&ink=dark&fov=19'],
    ['half a rocket', 'n=decY5&m=mean/w,regular/w,flat/w'],
    ['tomahawk', 'n=caU5&m=regular/w,affine/w,regular/w,flat/w&c=orbit&pal=earth&h=79&e=0.45&ink=dark&fov=19'],
  ]],
  ['Regular faces alone', [
    ['regular only non-convexly', 'n=ebC&m=regular/w'],
    ['non-convex deltahedron', 'n=knJ17&m=regular'],
    ['20 bulbs', 'n=dosmA5&m=regular'],
    ['bulbous, on strands', 'n=dosmA5&m=regular/w&e=0.2'],
    ['15 bulbs', 'n=dosmA5&m=regular/w,regular&e=0.2'],
  ]],
  ['Affine faces', [
    ['star (affine necessary)', 'n=ontJ17&m=regular/w,affine/w'],
    ['first affine star', 'n=ozJ45&m=affine'],
    ['affine, not regular', 'n=peC&m=affine/w'],
    ['nearly regular', 'n=caI&m=affine/w'],
    ['one tile, non-convex', 'n=jpD&m=affine/w'],
  ]],
  ['Spectral starts and as built', [
    ['inset pyramids', 'n=ocA6&m=spectral:1,flat'],
    ['star from a spectral start', 'n=okD&m=spectral:1,flat'],
    ['star faces as built', 'n=anzD&m=flat&e=0.2'],
  ]],
  ['Near misses', [
    ['almost regular', 'n=sktJ45&m=regular'],
    ['hard case for Canonical', 'n=ckmU5&m=mean/w,flat'],
  ]],
];
