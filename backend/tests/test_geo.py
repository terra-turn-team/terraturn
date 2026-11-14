from app.geo import analyze_polygon
from fastapi import HTTPException
import pytest

def test_area_and_centroid():
    poly = {"type": "Polygon", "coordinates": [[[-47.935, -19.755], [-47.93, -19.755], [-47.93, -19.75], [-47.935, -19.75], [-47.935, -19.755]]]}
    area, center = analyze_polygon(poly)
    assert 20 < area < 40
    assert abs(center[0] - (-47.9325)) < 1e-5

def test_reject_self_intersection():
    poly = {"type": "Polygon", "coordinates": [[[0,0],[1,1],[0,1],[1,0],[0,0]]]}
    with pytest.raises(HTTPException):
        analyze_polygon(poly)
