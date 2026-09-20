from fastapi import APIRouter

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
