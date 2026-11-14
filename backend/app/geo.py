from fastapi import HTTPException
from pyproj import Geod
from shapely.geometry import shape

GEOD = Geod(ellps="WGS84")


def analyze_polygon(geometry: dict) -> tuple[float, list[float]]:
    try:
        if geometry.get("type") != "Polygon":
            raise ValueError("Only simple polygons are allowed.")
        rings = geometry.get("coordinates", [])
        if len(rings) != 1:
            raise ValueError("Use a polygon without holes.")
        points = rings[0]
        if not 4 <= len(points) <= 1001:
            raise ValueError("Provide between 3 and 1000 vertices.")
        if points[0] != points[-1]:
            raise ValueError("The polygon outline must be closed.")
        for lon, lat in points:
            if not -180 <= lon <= 180 or not -90 <= lat <= 90:
                raise ValueError("Coordinates out of range.")
        poly = shape(geometry)
        if not poly.is_valid or poly.is_empty:
            raise ValueError("The polygon is invalid or has crossing edges.")
        if poly.area == 0:
            raise ValueError("The selected area cannot be zero.")
        area_m2, _ = GEOD.geometry_area_perimeter(poly)
        area_ha = abs(area_m2) / 10000
        if area_ha < 0.001 or area_ha > 1_000_000:
            raise ValueError("The selected area is outside the allowed range.")
        center = poly.centroid
        return round(area_ha, 4), [round(center.x, 7), round(center.y, 7)]
    except (ValueError, TypeError, IndexError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
