from fastapi import APIRouter, Depends
from typing import List
from app.models.entities import User
from app.api.v1.auth import get_current_user
from app.services.circadian_service import CircadianService
from app.schemas.all_schemas import CircadianPulseOut, CircadianInsightItem

router = APIRouter()
from app.core.cache import cached_response

@router.get("/pulse", response_model=CircadianPulseOut)
@cached_response(ttl=120)
def get_circadian_pulse(current_user: User = Depends(get_current_user)):
    chronotype = current_user.profile.chronotype if current_user.profile else "lark"
    pulse_data = CircadianService.calculate_pulse(chronotype)
    return pulse_data

@router.get("/insights", response_model=List[CircadianInsightItem])
@cached_response(ttl=120)
def get_circadian_insights(current_user: User = Depends(get_current_user)):
    chronotype = current_user.profile.chronotype if current_user.profile else "lark"
    return CircadianService.get_insights(chronotype)
