"""Feed settings over HTTP: the ID3 toggle must save, and the contract the
client has to respect (tag map values are strings) is spelled out by a 422."""
import pytest


def _make_feed(client):
    r = client.post("/api/feeds/manual", json={"title": "Tag Test"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_enable_id3_with_empty_mapping_saves(client):
    fid = _make_feed(client)
    r = client.put(f"/api/feeds/{fid}", json={"id3_enabled": True, "id3_field_mapping": {}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id3_enabled"] is True and body["id3_field_mapping"] == {}


def test_enable_id3_with_mapping_saves(client):
    fid = _make_feed(client)
    mapping = {"TIT2": "episode.title", "TALB": "feed.title"}
    r = client.put(f"/api/feeds/{fid}", json={"id3_enabled": True, "id3_field_mapping": mapping})
    assert r.status_code == 200, r.text
    assert r.json()["id3_field_mapping"] == mapping
    assert client.get(f"/api/feeds/{fid}").json()["id3_field_mapping"] == mapping


def test_boolean_in_mapping_is_rejected_with_a_named_field(client):
    """The payload the old UI sent when the toggle was on."""
    fid = _make_feed(client)
    r = client.put(f"/api/feeds/{fid}", json={"id3_enabled": True, "id3_field_mapping": {"enabled": True}})
    assert r.status_code == 422
    loc = r.json()["detail"][0]["loc"]
    assert "id3_field_mapping" in loc and "enabled" in loc


def test_limits_endpoint_matches_constants(client):
    from app import limits
    body = client.get("/api/limits").json()
    assert body == {
        "max_page_size": limits.MAX_PAGE_SIZE,
        "max_ids_in_url": limits.MAX_IDS_IN_URL,
        "max_bulk_ids": limits.MAX_BULK_IDS,
        "max_index_ids": limits.MAX_INDEX_IDS,
        "max_search_len": limits.MAX_SEARCH_LEN,
        "max_request_bytes": limits.MAX_REQUEST_BYTES,
    }


def test_auto_delete_played_global_default_and_feed_override(client, tmp_path):
    settings = client.put("/api/settings", json={"download_path": str(tmp_path / "downloads")})
    assert settings.status_code == 200, settings.text

    first_response = client.post("/api/feeds/manual", json={"title": "Auto Delete Global Test A"})
    second_response = client.post("/api/feeds/manual", json={"title": "Auto Delete Global Test B"})
    assert first_response.status_code in (200, 201), first_response.text
    assert second_response.status_code in (200, 201), second_response.text
    first_feed = first_response.json()["id"]
    second_feed = second_response.json()["id"]

    assert client.get(f"/api/feeds/{first_feed}").json()["auto_delete_played"] is False

    settings = client.put("/api/settings", json={"auto_delete_played": True})
    assert settings.status_code == 200, settings.text
    assert settings.json()["auto_delete_played"] is True

    inherited = client.get(f"/api/feeds/{first_feed}").json()
    assert inherited["auto_delete_played"] is True
    assert inherited["auto_delete_played_override"] is None

    overridden = client.put(
        f"/api/feeds/{first_feed}",
        json={"auto_delete_played_override": False},
    )
    assert overridden.status_code == 200, overridden.text
    assert overridden.json()["auto_delete_played"] is False
    assert overridden.json()["auto_delete_played_override"] is False
    assert client.get(f"/api/feeds/{second_feed}").json()["auto_delete_played"] is True

    inherited_again = client.put(
        f"/api/feeds/{first_feed}",
        json={"auto_delete_played_override": None},
    )
    assert inherited_again.status_code == 200, inherited_again.text
    assert inherited_again.json()["auto_delete_played"] is True
    assert inherited_again.json()["auto_delete_played_override"] is None
