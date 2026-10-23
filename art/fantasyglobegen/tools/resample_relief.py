"""Resamples a global latitude/longitude relief grid (netCDF, as GMT's earth_relief or
ETOPO) onto the cells of the icosahedral grid.

    python3 tools/resample_relief.py relief.grd cells.f64 heights.f32

Every source pixel goes to its nearest cell, and each cell takes the area-weighted mean
(weight cos(latitude)) of its pixels; a cell that no pixel reaches takes the bilinear value
at its centre. Needs numpy, scipy and netCDF4.
"""
import sys
import numpy as np
from netCDF4 import Dataset
from scipy.spatial import cKDTree
from scipy.interpolate import RegularGridInterpolator

src, cells_path, out = sys.argv[1:4]
d = Dataset(src)
lat = np.asarray(d.variables['lat'][:], dtype=np.float64)
lon = np.asarray(d.variables['lon'][:], dtype=np.float64)
z = np.ma.filled(d.variables['z'][:].astype(np.float64), np.nan)
if np.isnan(z).any():
    raise SystemExit('relief has missing values')
# a gridline-registered grid repeats longitude 180 as -180: drop the copy
if np.isclose(lon[-1] - lon[0], 360):
    lon, z = lon[:-1], z[:, :-1]

cells = np.fromfile(cells_path, dtype='<f8').reshape(-1, 3)
la, lo = np.meshgrid(np.radians(lat), np.radians(lon), indexing='ij')
pts = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1).reshape(-1, 3)
w = np.cos(la).ravel()
# the poles are single points repeated along a row: give each row its share once
w[w < 1e-9] = np.cos(np.radians(90 - (lat[1] - lat[0]) / 4)) / len(lon)

_, nearest = cKDTree(cells).query(pts, workers=-1)
num = np.bincount(nearest, weights=w * z.ravel(), minlength=len(cells))
den = np.bincount(nearest, weights=w, minlength=len(cells))

h = np.empty(len(cells))
hit = den > 0
h[hit] = num[hit] / den[hit]
if (~hit).any():
    clat = np.degrees(np.arcsin(np.clip(cells[~hit, 2], -1, 1)))
    clon = np.degrees(np.arctan2(cells[~hit, 1], cells[~hit, 0]))
    zz = np.concatenate([z, z[:, :1]], 1)
    ll = np.concatenate([lon, lon[:1] + 360])
    clon = np.where(clon < ll[0], clon + 360, clon)
    h[~hit] = RegularGridInterpolator((lat, ll), zz)(np.stack([clat, clon], -1))
h.astype('<f4').tofile(out)
print(f'{len(cells)} cells, {(~hit).sum()} filled by interpolation, {h.min():.0f} to {h.max():.0f} m')
