// The examples menu (U1): the owner's shapes from docs/catalogue.md, each a link (the part after
// '#') with a short name for it (the owner's own words are in the catalogue). Keep it in step with the catalogue; tests/examples.mjs
// replays every link and checks the catalogue's numbers.

export const EXAMPLES = [
  ['Folded', [
    ['Origami bloom', 'n=scnC&m=regular,flat'],
    ['Kite labyrinth', 'n=jtJ37&m=regular,flat'],
    ['Inset squares', 'n=csJ45&m=regular,flat'],
    ['Kite ball', 'n=oD&m=regular,flat'],
    ['Smoke boulder', 'n=okzD&m=regular,flat&e=0.2'],
    ['Pyrite', 'n=jcaJ29&m=regular,flat&e=0.2'],
    ['Virus', 'n=ocI&m=regular/w,flat/w&e=0.2'],
    ['Spinning top', 'n=jJ46&m=regular,flat&e=0.2'],
    ['Dented sphere', 'n=josJ37&m=regular,flat&e=0.2'],
    ['Tube disk', 'n=okA7&m=regular,flat'],
    ['Drum', 'n=pU5&m=regular/w,flat/w'],
    ['Screw', 'n=ogdJ37&m=regular/w,flat/w&h=79&e=0.15&ink=dark&fov=19'],
    ['Half rocket', 'n=decY5&m=mean/w,regular/w,flat/w'],
    ['Tomahawk', 'n=caU5&m=regular/w,affine/w,regular/w,flat/w&c=orbit&pal=earth&h=79&e=0.45&ink=dark&fov=19'],
  ]],
  ['Regular polygons', [
    ['Regular, never convex', 'n=ebC&m=regular/w'],
    ['Folded deltahedron', 'n=knJ17&m=regular'],
    ['Twenty bulbs', 'n=dosmA5&m=regular'],
    ['Bulbs on strands', 'n=dosmA5&m=regular/w&e=0.2'],
    ['Fifteen bulbs', 'n=dosmA5&m=regular/w,regular&e=0.2'],
  ]],
  ['Stars and rhombi', [
    ['Affine star', 'n=ontJ17&m=regular/w,affine/w'],
    ['First star', 'n=ozJ45&m=affine'],
    ['Chiral cube', 'n=peC&m=affine/w'],
    ['Soft icosahedron', 'n=caI&m=affine/w'],
    ['Golden rhombi', 'n=jpD&m=affine/w'],
  ]],
  ['From the graph', [
    ['Inset pyramids', 'n=ocA6&m=spectral:1,flat'],
    ['Kite star', 'n=okD&m=spectral:1,flat'],
    ['Star faces', 'n=anzD&m=flat&e=0.2'],
  ]],
  ['Near misses', [
    ['Almost regular', 'n=sktJ45&m=regular'],
    ['Tangle', 'n=ckmU5&m=mean/w,flat'],
  ]],
];
