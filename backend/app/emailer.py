import smtplib
from email.message import EmailMessage
from urllib.parse import quote

from app.config import settings


def send_password_reset(to: str, token: str) -> None:
    link = f"{settings.primary_origin}/reset-password#token={quote(token)}"
    msg = EmailMessage()
    msg["Subject"] = "TerraTurn: reset your password"
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.set_content(
        "You asked to reset your TerraTurn password.\n\n"
        f"Use this link within 15 minutes:\n{link}\n\n"
        "If you did not ask for it, ignore this email."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=8) as smtp:
        if settings.smtp_user:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
