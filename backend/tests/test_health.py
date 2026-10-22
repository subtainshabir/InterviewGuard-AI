def test_health_endpoint(client):
    """Test health check route returns status ok and metadata."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "app_name" in data
    assert "version" in data


def test_api_not_found(client):
    """Test non-existent route returns 404."""
    response = client.get("/api/non-existent-route")
    assert response.status_code == 404
