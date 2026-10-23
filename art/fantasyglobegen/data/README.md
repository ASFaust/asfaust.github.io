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

`earth-observed.globe` holds the observed climate at level 6 (40,962 cells), 12 monthly
means each, for comparing the model with: `temperature` (2 m air, °C), `precipitation`
(mm/day), `wind_east` and `wind_north` (near-surface, sigma 0.995, m/s). All are long-term
means over 1991–2020, from NOAA PSL:

- precipitation: GPCP v2.3 (Adler, R. F., et al., 2018, *The Global Precipitation
  Climatology Project (GPCP) monthly analysis (new version 2.3) and a review of 2017 global
  precipitation*, Atmosphere 9(4), 138, https://doi.org/10.3390/atmos9040138), file
  `precip.mon.ltm.1991-2020.nc`;
- temperature and wind: NCEP/NCAR Reanalysis 1 (Kalnay, E., et al., 1996, *The NCEP/NCAR
  40-year reanalysis project*, Bull. Amer. Meteor. Soc. 77, 437–471), files
  `air.2m.mon.ltm.1991-2020.nc`, `uwnd.sig995.mon.ltm.1991-2020.nc` and
  `vwnd.sig995.mon.ltm.1991-2020.nc`.

Rebuilt with `tools/cells.mjs 6`, `tools/resample_climatology.py` (bilinear, per month) for
each file, and `tools/pack_layers.mjs` with float16 layers.

To run the model on Earth and compare (level, years, optional output file, parameters):

    node tools/compare.mjs 5 4 '' '{"heatDiffusion": 0.4}'
