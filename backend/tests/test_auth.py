

def test_reset_email_uses_resend_api_when_key_is_set(monkeypatch):
    from app import emailer
    from app.config import settings

    sent = {}

    class Resp:
        def raise_for_status(self):
            return None

    def fake_post(url, **kw):
        sent["url"], sent["json"], sent["auth"] = url, kw["json"], kw["headers"]["Authorization"]
        return Resp()

    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(emailer.httpx, "post", fake_post)
    emailer.send_password_reset("ana@example.com", "tok")
    assert sent["url"] == "https://api.resend.com/emails"
    assert sent["json"]["to"] == ["ana@example.com"] and "reset-password#token=tok" in sent["json"]["text"]
    assert sent["auth"] == "Bearer re_test"
