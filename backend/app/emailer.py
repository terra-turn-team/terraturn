import smtplib
from email.message import EmailMessage
from urllib.parse import quote

import httpx

from app.config import settings


def _reset_text(link: str) -> str:
    return ("You asked to reset your TerraTurn password.\n\n"
            f"Use this link within 15 minutes:\n{link}\n\n"
            "If you did not ask for it, ignore this email.")


def send_password_reset(to: str, token: str) -> None:
    link = f"{settings.primary_origin}/reset-password#token={quote(token)}"
    subject = "TerraTurn: reset your password"
    if settings.resend_api_key:
        # API HTTP do Resend: não depende de porta SMTP liberada no servidor.
        r = httpx.post("https://api.resend.com/emails", timeout=10,
                       headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                       json={"from": settings.email_from, "to": [to], "subject": subject, "text": _reset_text(link)})
        r.raise_for_status()
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.set_content(_reset_text(link))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=8) as smtp:
        if settings.smtp_user:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
