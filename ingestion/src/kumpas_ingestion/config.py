import os
from dataclasses import dataclass


EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


class ConfigError(RuntimeError):
    pass


def _require(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise ConfigError(
        f"One of {', '.join(names)} is required but not set. "
        "Set it as a GitHub Actions secret or local env var."
    )


@dataclass(frozen=True)
class IngestionConfig:
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str
    embedding_model: str = EMBEDDING_MODEL
    embedding_dimensions: int = EMBEDDING_DIMENSIONS

    def __post_init__(self) -> None:
        if (self.embedding_model, self.embedding_dimensions) != (
            EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
        ):
            raise ConfigError(
                "Incompatible embedding configuration: ingestion and query require "
                f"{EMBEDDING_MODEL} with {EMBEDDING_DIMENSIONS} dimensions. "
                "Update both services and re-embed stored records before changing models."
            )

    @classmethod
    def from_env(cls) -> "IngestionConfig":
        return cls(
            supabase_url=_require("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
            supabase_service_role_key=_require("SUPABASE_SERVICE_ROLE_KEY"),
            gemini_api_key=_require("GEMINI_API_KEY"),
            embedding_model=os.environ.get("EMBEDDING_MODEL", EMBEDDING_MODEL),
            embedding_dimensions=_dimensions_from_env(),
        )


def _dimensions_from_env() -> int:
    if os.environ.get("EMBEDDING_DIMENSIONS", str(EMBEDDING_DIMENSIONS)) != "768":
        raise ConfigError("EMBEDDING_DIMENSIONS must be 768")
    return EMBEDDING_DIMENSIONS
