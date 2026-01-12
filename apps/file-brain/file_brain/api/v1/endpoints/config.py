from fastapi import APIRouter
from pydantic import BaseModel

from file_brain.core.config import settings

router = APIRouter()


class AppConfig(BaseModel):
    """Configuration exposed to the frontend"""

    typesense: dict


@router.get("", response_model=AppConfig)
async def get_config():
    """
    Get application configuration required for the frontend.
    This allows dynamic configuration (like API keys) to be passed to the UI.
    """
    return {
        "typesense": {
            "api_key": settings.typesense_api_key,
            "host": settings.typesense_host,
            "port": settings.typesense_port,
            "protocol": settings.typesense_protocol,
            "collection_name": settings.typesense_collection_name,
        }
    }
