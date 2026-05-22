import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    pass


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(
            f"{name} is required but not set. "
            "Set it as a GitHub Actions secret or local env var."
        )
    return value


@dataclass(frozen=True)
class IngestionConfig:
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str
    embedding_model: str = "text-embedding-004"
    embedding_dimensions: int = 768

    @classmethod
    def from_env(cls) -> "IngestionConfig":
        return cls(
            supabase_url=_require("SUPABASE_URL"),
            supabase_service_role_key=_require("SUPABASE_SERVICE_ROLE_KEY"),
            gemini_api_key=_require("GEMINI_API_KEY"),
        )
