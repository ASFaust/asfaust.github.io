"""Interpolates monthly climatologies on latitude/longitude grids (NOAA PSL netCDF files)
onto the cells of the icosahedral grid, bilinearly, longitude wrapping around.

    python3 tools/resample_climatology.py cells.f64 out.f32 file.nc variable [offset]

Writes 12 × N float32 values, month by month; offset is added (−273.15 for kelvin).
Needs numpy, scipy and netCDF4.
"""
import sys
import numpy as np
from netCDF4 import Dataset
from scipy.interpolate import RegularGridInterpolator

cells_path, out, src, var = sys.argv[1:5]
offset = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
cells = np.fromfile(cells_path, dtype='<f8').reshape(-1, 3)
clat = np.degrees(np.arcsin(np.clip(cells[:, 2], -1, 1)))
clon = np.degrees(np.arctan2(cells[:, 1], cells[:, 0])) % 360

d = Dataset(src)
lat = np.asarray(d.variables['lat'][:], dtype=np.float64)
lon = np.asarray(d.variables['lon'][:], dtype=np.float64) % 360
v = np.ma.filled(d.variables[var][:].astype(np.float64), np.nan)
if np.isnan(v).any():
    raise SystemExit(f'{var} has missing values')
order = np.argsort(lat)
lat, v = lat[order], v[:, order, :]
lo = np.argsort(lon)
lon, v = lon[lo], v[:, :, lo]
# wrap longitude, and clamp latitudes beyond the outermost rows to them
lonw = np.concatenate([lon[-1:] - 360, lon, lon[:1] + 360])
vw = np.concatenate([v[:, :, -1:], v, v[:, :, :1]], 2)
q = np.stack([np.clip(clat, lat[0], lat[-1]), clon], -1)
res = np.stack([RegularGridInterpolator((lat, lonw), vw[m])(q) for m in range(v.shape[0])]) + offset
res.astype('<f4').tofile(out)
print(f'{var}: {res.shape[0]} months, {res.min():.2f} to {res.max():.2f}')
