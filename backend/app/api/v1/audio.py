from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict
from pydantic import BaseModel
from app.core.database import get_db
from app.core.cache import cached_response
from app.models.entities import User, AudioPreset
from app.api.v1.auth import get_current_user

router = APIRouter()

@router.get("/tracks")
def get_sound_tracks():
    return [
        {
            "id": "track_1",
            "title": "Sóng Biển Hải Đăng & Mưa Rơi",
            "frequency": "432Hz Alpha Tune",
            "category": "nature_alpha",
            "description": "Âm thanh kích hoạt sóng não Alpha 10Hz thư thái, hỗ trợ học tập liên tục không mỏi mắt",
            "is_default": True
        },
        {
            "id": "track_2",
            "title": "Rừng Thông Sương Mù Đà Lạt",
            "frequency": "528Hz Solfeggio",
            "category": "forest",
            "description": "Tiếng thông reo dịu nhẹ tái tạo năng lượng tinh thần",
            "is_default": False
        },
        {
            "id": "track_3",
            "title": "Giai Điệu Lo-Fi Học Bài Đêm",
            "frequency": "Chill Beats 80BPM",
            "category": "lofi",
            "description": "Giai điệu thư thái êm dịu, không lời, duy trì trạng thái Deep Flow",
            "is_default": False
        },
        {
            "id": "track_4",
            "title": "Quán Cafe Thư Viện Tĩnh Lặng",
            "frequency": "Binaural Theta 6Hz",
            "category": "cafe",
            "description": "Âm thanh nền xao xuyến nhẹ kích thích khả năng liên tưởng sáng tạo",
            "is_default": False
        }
    ]


class PresetCreate(BaseModel):
    name: str
    track: str = "ocean"
    volume: float = 0.65
    levels: Optional[Dict[str, float]] = None
    spatial_on: bool = True


ALLOWED_PRESET_TRACKS = {"ocean", "rain", "binaural"}


@router.get("/presets")
@cached_response(ttl=60)
def list_presets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    presets = db.query(AudioPreset).filter(
        AudioPreset.user_id == current_user.id
    ).order_by(AudioPreset.created_at.desc()).all()
    import json
    return {
        "presets": [
            {
                "id": p.id,
                "name": p.name,
                "track": p.track,
                "volume": p.volume,
                "levels": json.loads(p.levels_json or "{}"),
                "spatial_on": p.spatial_on,
                "created_at": p.created_at,
            }
            for p in presets
        ]
    }


@router.post("/presets")
def save_preset(
    preset_in: PresetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    name = (preset_in.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên preset không được trống.")
    if preset_in.track not in ALLOWED_PRESET_TRACKS:
        raise HTTPException(status_code=400, detail="Track chưa được hỗ trợ synth offline.")
    if not (0 <= preset_in.volume <= 1):
        raise HTTPException(status_code=400, detail="Âm lượng phải từ 0 đến 1.")
    preset = AudioPreset(
        user_id=current_user.id,
        name=name[:100],
        track=preset_in.track,
        volume=preset_in.volume,
        levels_json=json.dumps(preset_in.levels or {}),
        spatial_on=preset_in.spatial_on,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return {"status": "success", "id": preset.id, "name": preset.name}


@router.delete("/presets/{preset_id}")
def delete_preset(
    preset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preset = db.query(AudioPreset).filter(
        AudioPreset.id == preset_id, AudioPreset.user_id == current_user.id
    ).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Không tìm thấy preset.")
    db.delete(preset)
    db.commit()
    return {"status": "success", "message": "Đã xóa preset."}
