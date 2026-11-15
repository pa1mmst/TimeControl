"""Ошибки API с ключом перевода (ТЗ 4.3).

Сервисы и роутеры поднимают AppError(status, "ключ", **параметры) — без текста.
Текст берётся из app/i18n/*.json на языке ТЕКУЩЕГО пользователя: require_actor
кладёт его язык в request.state.lang, а обработчик ниже собирает detail.
До опознания пользователя (401) тексты остаются простыми строками.
"""
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.bot.i18n import t_plain


class AppError(HTTPException):
    """HTTP-ошибка с ключом перевода и параметрами подстановки."""

    def __init__(self, status_code: int, key: str, **params):
        super().__init__(status_code=status_code, detail=key)
        self.key = key
        self.params = params

    def render(self, lang) -> str:
        return t_plain(lang, self.key, **self.params)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    lang = getattr(request.state, "lang", None)
    return JSONResponse(
        {"detail": exc.render(lang)}, status_code=exc.status_code,
        headers=getattr(exc, "headers", None),
    )
