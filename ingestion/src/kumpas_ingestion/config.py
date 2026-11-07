import base64
import json
import os
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


class ConfigError(RuntimeError):
    pass


def require_https(request) -> None:
    if request.url.scheme != "https":
        raise ConfigError("External ingestion requests require HTTPS")


def _require(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    raise ConfigError(
        f"One of {', '.join(names)} is required but not set. "
        "Set it as a GitHub Actions secret or local env var."
    )


@dataclass(frozen=True)
class IngestionConfig:
    supabase_url: str
    supabase_ingestion_token: str = field(repr=False)
    gemini_api_key: str = field(repr=False)
    supabase_publishable_key: str = field(default="", repr=False)
    embedding_model: str = EMBEDDING_MODEL
    embedding_dimensions: int = EMBEDDING_DIMENSIONS

    def __post_init__(self) -> None:
        for name in ("supabase_ingestion_token", "gemini_api_key"):
            value = getattr(self, name).strip()
            if not value:
                raise ConfigError(f"{name} is required")
            object.__setattr__(self, name, value)
        try:
            url = urlsplit(self.supabase_url.strip())
            local = os.environ.get("KUMPAS_ENV") == "development" and url.hostname in (
                "localhost", "127.0.0.1", "::1"
            )
            if (not url.hostname or url.username or url.password or url.query or url.fragment
                    or (url.scheme != "https" and not (local and url.scheme == "http"))):
                raise ValueError
        except ValueError:
            raise ConfigError("SUPABASE_URL requires HTTPS; development HTTP must use loopback") from None
        object.__setattr__(self, "supabase_url", self.supabase_url.strip())
        if os.environ.get("GEMINI_API_VERSION", "v1beta").strip() != "v1beta":
            raise ConfigError("GEMINI_API_VERSION must be v1beta")
        alternate = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        primary = os.environ.get("SUPABASE_URL", "").strip()
        if alternate and primary and alternate.rstrip("/") != primary.rstrip("/"):
            raise ConfigError("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must identify the same project")
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
        config = cls(
            supabase_url=_require("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
            supabase_ingestion_token=_require("SUPABASE_INGESTION_TOKEN"),
            supabase_publishable_key=_require("SUPABASE_PUBLISHABLE_KEY"),
            gemini_api_key=_require("GEMINI_API_KEY"),
            embedding_model=os.environ.get("EMBEDDING_MODEL", EMBEDDING_MODEL),
            embedding_dimensions=_dimensions_from_env(),
        )
        # This is a fail-closed configuration check, not signature verification.
        # Supabase verifies the JWT signature; a service-role key must never be used here.
        try:
            encoded = config.supabase_ingestion_token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            if not isinstance(claims, dict):
                raise TypeError
            if claims.get("role") != "ingestion_worker" or float(claims.get("exp", 0)) <= time.time():
                raise ValueError
        except (ValueError, TypeError, IndexError, KeyError):
            raise ConfigError("SUPABASE_INGESTION_TOKEN must be an unexpired ingestion_worker JWT") from None
        return config


def _dimensions_from_env() -> int:
    if os.environ.get("EMBEDDING_DIMENSIONS", str(EMBEDDING_DIMENSIONS)) != "768":
        raise ConfigError("EMBEDDING_DIMENSIONS must be 768")
    return EMBEDDING_DIMENSIONS
