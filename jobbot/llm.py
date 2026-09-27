"""Thin wrapper around the Claude API used by every LLM step."""
from __future__ import annotations

import logging
from typing import Protocol, TypeVar

import anthropic
from pydantic import BaseModel

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    def structured(self, *, system: str, user: str, schema: type[T], effort: str | None = None,
                   max_tokens: int = 16000) -> T: ...


class ClaudeLLM:
    def __init__(self, model: str, effort: str = "medium", use_fallbacks: bool = True):
        self.client = anthropic.Anthropic()
        self.model = model
        self.effort = effort
        self.use_fallbacks = use_fallbacks

    def structured(self, *, system: str, user: str, schema: type[T], effort: str | None = None,
                   max_tokens: int = 16000) -> T:
        kwargs = {}
        if self.use_fallbacks:
            # Server-side fallback: a request declined by a safety classifier is
            # re-run on Anthropic's recommended fallback model in the same call.
            kwargs = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        try:
            response = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                thinking={"type": "adaptive"},
                output_config={"effort": effort or self.effort},
                output_format=schema,
                **kwargs,
            )
        except anthropic.RateLimitError as e:
            raise LLMError(f"Claude API rate limit: {e.message}") from e
        except anthropic.AuthenticationError as e:
            raise LLMError("Claude API key missing or invalid (ANTHROPIC_API_KEY)") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"Claude API error {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError(f"Could not reach the Claude API: {e}") from e

        if response.stop_reason == "refusal":
            raise LLMError("Claude declined this request")
        if response.stop_reason == "max_tokens":
            raise LLMError("Claude response was cut off (max_tokens)")
        if response.parsed_output is None:
            raise LLMError("Claude returned no parsable output")
        return response.parsed_output
