# Test data

`earth.globe` holds the real Earth's relief at grid level 7 (163,842 cells, about 56 km
apart), as one `height` layer in metres, land and ocean floor. It is the test input for the
climate model: run on Earth, the result can be compared with the observed climate.

Source: SRTM15+ V2.7 (Tozer, B., Sandwell, D. T., Smith, W. H. F., et al., 2019, *Global
bathymetry and topography at 15 arc sec: SRTM15+*, Earth and Space Science 6,
https://doi.org/10.1029/2019EA000658), as reduced to 15 arc-minutes by the Generic Mapping
Tools data server (`earth_relief_15m_g.grd`, Gaussian filter of 78.6 km full width).

Rebuilt with:

    node tools/cells.mjs 7 cells.f64
    python3 tools/resample_relief.py earth_relief_15m_g.grd cells.f64 heights.f32
    node tools/pack_layer.mjs heights.f32 7 height int16 m data/earth.globe '{"name":"Earth"}'

Each source pixel goes to its nearest cell, and a cell takes the area-weighted mean of its
pixels; at level 7 every cell gets at least one pixel.
