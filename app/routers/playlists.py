import logging
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Playlist, PlaylistEpisode, Episode, Feed
from app.schemas import (
    PlaylistOut, PlaylistCreate, PlaylistUpdate,
    PlaylistEpisodeAdd, PlaylistReorder, EpisodeOut,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/playlists", tags=["playlists"])


DEFAULT_NEW_RELEASES_CONFIG = {
    "feed_ids": [],
    "release_days": 90,
    "sort": "desc",
    "episode_status": "all",
    "download_status": "any",
}

DEFAULT_NEW_RELEASES_DESCRIPTION = "Recently released episodes matching your smart filters."


def _normalise_smart_config(config: dict | None) -> dict:
    cfg = {**DEFAULT_NEW_RELEASES_CONFIG, **(config or {})}
    feed_ids = cfg.get("feed_ids") or []
    if not isinstance(feed_ids, list):
        raise HTTPException(400, "feed_ids must be a list")
    try:
        cfg["feed_ids"] = sorted({int(fid) for fid in feed_ids if int(fid) > 0})
    except (TypeError, ValueError):
        raise HTTPException(400, "feed_ids must contain only feed ids")

    release_days = cfg.get("release_days")
    if release_days in ("", None):
        cfg["release_days"] = None
    else:
        try:
            release_days = int(release_days)
        except (TypeError, ValueError):
            raise HTTPException(400, "release_days must be a number")
        if release_days < 0 or release_days > 36500:
            raise HTTPException(400, "release_days must be between 0 and 36500")
        cfg["release_days"] = release_days

    if cfg.get("sort") not in {"asc", "desc"}:
        raise HTTPException(400, "sort must be 'asc' or 'desc'")
    if cfg.get("episode_status") not in {"all", "played", "unplayed", "in_progress"}:
        raise HTTPException(400, "episode_status must be all, played, unplayed, or in_progress")
    if cfg.get("download_status") not in {"any", "pending", "queued", "downloading", "downloaded", "failed", "skipped"}:
        raise HTTPException(400, "download_status is not valid")
    return cfg


def ensure_default_smart_playlists(db: Session) -> None:
    existing = db.query(Playlist).filter(Playlist.smart_key == "new_releases").first()
    if existing:
        if existing.description == "Example smart list for recently released downloaded episodes.":
            existing.description = DEFAULT_NEW_RELEASES_DESCRIPTION
        previous_defaults = [
            {**DEFAULT_NEW_RELEASES_CONFIG, "release_days": 30, "download_status": "downloaded"},
            {**DEFAULT_NEW_RELEASES_CONFIG, "release_days": 30},
        ]
        if existing.smart_config in previous_defaults:
            existing.smart_config = DEFAULT_NEW_RELEASES_CONFIG.copy()
        db.commit()
        return
    db.add(Playlist(
        name="New Releases",
        description=DEFAULT_NEW_RELEASES_DESCRIPTION,
        type="smart",
        filter="all",
        smart_key="new_releases",
        smart_config=DEFAULT_NEW_RELEASES_CONFIG.copy(),
    ))
    db.commit()


def _episode_out(ep: Episode, db: Session) -> EpisodeOut:
    feed = db.get(Feed, ep.feed_id)
    d = EpisodeOut.model_validate(ep)
    d.feed_title = feed.title if feed else None
    d.feed_play_order = (feed.play_order or "newest") if feed else None
    # Artwork always resolves to this server, never to the podcast host — the
    # same rule the episodes and feeds routers follow. This one served RSS URLs
    # straight from the feed record, so a playlist was one more page quietly
    # telling third parties who was reading it and when.
    from app.routers.feeds import feed_cover_url
    d.feed_image_url = feed_cover_url(feed, db) if feed else None
    if not ep.custom_image_url:
        art_path = os.path.splitext(ep.file_path)[0] + ".jpg" if ep.file_path else None
        d.episode_image_url = (
            f"/api/episodes/{ep.id}/cover.jpg"
            if art_path and os.path.exists(art_path)
            else None
        )
    return d


def _feed_queue(feed_id: int, filter_: str, db: Session) -> list[Episode]:
    """Playable episodes of a podcast (primary + supplementary feeds), oldest
    first using the same ordering as episode numbering."""
    from app.routers.episodes import episode_order_key
    from app.utils import get_group_feed_ids
    q = (
        db.query(Episode)
        .filter(
            Episode.feed_id.in_(get_group_feed_ids(db, feed_id)),
            Episode.hidden.is_(False),
            Episode.status == "downloaded",
        )
    )
    if filter_ == "unplayed":
        q = q.filter(Episode.played.is_(False))
    return q.order_by(*episode_order_key()).all()


def _playlist_queue(playlist_id: int, db: Session) -> list[Episode]:
    rows = (
        db.query(PlaylistEpisode)
        .filter(PlaylistEpisode.playlist_id == playlist_id)
        .order_by(PlaylistEpisode.position)
        .all()
    )
    return [r.episode for r in rows]


def _smart_queue(playlist_id: int, db: Session) -> list[Episode]:
    playlist = db.get(Playlist, playlist_id)
    if not playlist:
        return []
    cfg = _normalise_smart_config(playlist.smart_config)
    q = db.query(Episode).filter(Episode.hidden.is_(False))

    if cfg["feed_ids"]:
        q = q.filter(Episode.feed_id.in_(cfg["feed_ids"]))
    if cfg["release_days"] is not None:
        q = q.filter(Episode.published_at >= datetime.utcnow() - timedelta(days=cfg["release_days"]))

    episode_status = cfg["episode_status"]
    if episode_status == "played":
        q = q.filter(Episode.played.is_(True))
    elif episode_status == "unplayed":
        q = q.filter(Episode.played.is_(False))
    elif episode_status == "in_progress":
        q = q.filter(Episode.played.is_(False), Episode.play_position_seconds > 0)

    if cfg["download_status"] != "any":
        q = q.filter(Episode.status == cfg["download_status"])

    if cfg["sort"] == "asc":
        q = q.order_by(Episode.published_at.asc().nullslast(), Episode.episode_number.asc().nullslast(), Episode.id.asc())
    else:
        q = q.order_by(Episode.published_at.desc().nullslast(), Episode.episode_number.asc().nullslast(), Episode.id.asc())
    return q.all()


def get_queue(context_type: str, context_id: int, context_filter: str | None, db: Session) -> list[Episode]:
    if context_type == "feed":
        return _feed_queue(context_id, context_filter or "unplayed", db)
    playlist = db.get(Playlist, context_id)
    if playlist and playlist.type == "smart":
        return _smart_queue(context_id, db)
    return _playlist_queue(context_id, db)


@router.get("", response_model=list[PlaylistOut])
def list_playlists(db: Session = Depends(get_db)):
    ensure_default_smart_playlists(db)
    rows = db.query(Playlist).order_by(Playlist.created_at).all()
    out = []
    for pl in rows:
        o = PlaylistOut.model_validate(pl)
        if pl.type == "feed" and pl.feed_id:
            o.episode_count = len(_feed_queue(pl.feed_id, pl.filter, db))
        elif pl.type == "smart":
            o.episode_count = len(_smart_queue(pl.id, db))
        else:
            o.episode_count = db.query(PlaylistEpisode).filter(
                PlaylistEpisode.playlist_id == pl.id
            ).count()
        out.append(o)
    return out


@router.post("", response_model=PlaylistOut, status_code=201)
def create_playlist(body: PlaylistCreate, db: Session = Depends(get_db)):
    if body.type not in {"custom", "feed", "smart"}:
        raise HTTPException(400, "Playlist type must be custom, feed, or smart")
    pl = Playlist(
        name=body.name,
        description=body.description,
        type=body.type,
        feed_id=body.feed_id if body.type == "feed" else None,
        filter=body.filter if body.type == "feed" else "all",
        smart_config=_normalise_smart_config(body.smart_config) if body.type == "smart" else None,
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    o = PlaylistOut.model_validate(pl)
    o.episode_count = 0
    return o


@router.get("/feed-memberships")
def feed_memberships(feed_id: int, db: Session = Depends(get_db)):
    """Return IDs of episodes in the given feed that belong to any custom playlist."""
    rows = (
        db.query(PlaylistEpisode.episode_id)
        .join(Episode, Episode.id == PlaylistEpisode.episode_id)
        .filter(Episode.feed_id == feed_id)
        .all()
    )
    return {"episode_ids": [r.episode_id for r in rows]}


@router.get("/episode-memberships", response_model=list[PlaylistOut])
def episode_memberships(episode_id: int, db: Session = Depends(get_db)):
    """Return all custom playlists that contain the given episode."""
    rows = (
        db.query(PlaylistEpisode)
        .filter(PlaylistEpisode.episode_id == episode_id)
        .all()
    )
    playlist_ids = {r.playlist_id for r in rows}
    out = []
    for pl in db.query(Playlist).filter(Playlist.id.in_(playlist_ids)).all():
        o = PlaylistOut.model_validate(pl)
        o.episode_count = db.query(PlaylistEpisode).filter(PlaylistEpisode.playlist_id == pl.id).count()
        out.append(o)
    return out


@router.get("/{playlist_id}", response_model=PlaylistOut)
def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    o = PlaylistOut.model_validate(pl)
    if pl.type == "feed" and pl.feed_id:
        o.episode_count = len(_feed_queue(pl.feed_id, pl.filter, db))
    elif pl.type == "smart":
        o.episode_count = len(_smart_queue(pl.id, db))
    else:
        o.episode_count = db.query(PlaylistEpisode).filter(
            PlaylistEpisode.playlist_id == pl.id
        ).count()
    return o


@router.put("/{playlist_id}", response_model=PlaylistOut)
def update_playlist(playlist_id: int, body: PlaylistUpdate, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if body.name is not None:
        pl.name = body.name
    if body.description is not None:
        pl.description = body.description
    if body.filter is not None:
        pl.filter = body.filter
    if body.smart_config is not None:
        if pl.type != "smart":
            raise HTTPException(400, "Only smart playlists have smart filters")
        pl.smart_config = _normalise_smart_config(body.smart_config)
    db.commit()
    db.refresh(pl)
    o = PlaylistOut.model_validate(pl)
    if pl.type == "feed" and pl.feed_id:
        o.episode_count = len(_feed_queue(pl.feed_id, pl.filter, db))
    elif pl.type == "smart":
        o.episode_count = len(_smart_queue(pl.id, db))
    else:
        o.episode_count = db.query(PlaylistEpisode).filter(
            PlaylistEpisode.playlist_id == pl.id
        ).count()
    return o


@router.delete("/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    db.delete(pl)
    db.commit()


@router.get("/{playlist_id}/episodes", response_model=list[EpisodeOut])
def get_playlist_episodes(playlist_id: int, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    episodes = get_queue(pl.type, pl.feed_id if pl.type == "feed" else pl.id, pl.filter, db)
    return [_episode_out(ep, db) for ep in episodes]


@router.post("/{playlist_id}/episodes", status_code=204)
def add_episode(playlist_id: int, body: PlaylistEpisodeAdd, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if pl.type != "custom":
        raise HTTPException(400, "Cannot manually add episodes to a computed playlist")
    ep = db.get(Episode, body.episode_id)
    if not ep:
        raise HTTPException(404, "Episode not found")
    existing = db.query(PlaylistEpisode).filter(
        PlaylistEpisode.playlist_id == playlist_id,
        PlaylistEpisode.episode_id == body.episode_id,
    ).first()
    if existing:
        return  # already in playlist, silently ignore
    max_pos = db.query(PlaylistEpisode).filter(
        PlaylistEpisode.playlist_id == playlist_id
    ).count()
    db.add(PlaylistEpisode(playlist_id=playlist_id, episode_id=body.episode_id, position=max_pos))
    db.commit()


@router.delete("/{playlist_id}/episodes/{episode_id}", status_code=204)
def remove_episode(playlist_id: int, episode_id: int, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if pl.type != "custom":
        raise HTTPException(400, "Cannot remove episodes from a computed playlist")
    row = db.query(PlaylistEpisode).filter(
        PlaylistEpisode.playlist_id == playlist_id,
        PlaylistEpisode.episode_id == episode_id,
    ).first()
    if row:
        db.delete(row)
        db.commit()
        _repack_positions(playlist_id, db)


@router.put("/{playlist_id}/episodes/reorder", status_code=204)
def reorder_episodes(playlist_id: int, body: PlaylistReorder, db: Session = Depends(get_db)):
    pl = db.get(Playlist, playlist_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if pl.type != "custom":
        raise HTTPException(400, "Cannot reorder a computed playlist")
    rows = {
        r.episode_id: r
        for r in db.query(PlaylistEpisode).filter(PlaylistEpisode.playlist_id == playlist_id)
    }
    # An incomplete body is never a meaningful request, and silently accepting
    # one corrupts the playlist: positions are assigned 0..n-1 to the ids that
    # were sent while every omitted episode keeps its original position, so the
    # two sets collide and the resulting order is arbitrary. The schema already
    # states the contract ("a complete list, and truncating it would silently
    # reorder into the wrong shape") — this enforces it, for every client rather
    # than only the ones that remember.
    sent = set(body.episode_ids)
    if sent != set(rows) or len(body.episode_ids) != len(sent):
        raise HTTPException(
            400,
            "Reorder must list every episode in the playlist exactly once "
            f"({len(rows)} expected, {len(body.episode_ids)} received)",
        )
    for pos, ep_id in enumerate(body.episode_ids):
        rows[ep_id].position = pos
    db.commit()


def _repack_positions(playlist_id: int, db: Session):
    rows = (
        db.query(PlaylistEpisode)
        .filter(PlaylistEpisode.playlist_id == playlist_id)
        .order_by(PlaylistEpisode.position)
        .all()
    )
    for i, row in enumerate(rows):
        row.position = i
    db.commit()
