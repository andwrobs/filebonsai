#!/usr/bin/env python3
"""Check the running local stack, including a complete Authentik OIDC sign-in."""

import http.cookiejar
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.error
import urllib.request
import uuid

WEB = "http://localhost:15173"
AUTHENTIK = "http://authentik.localhost:9000"


def bootstrap_password():
    for line in Path(__file__).with_name(".env").read_text().splitlines():
        if line.startswith("AUTHENTIK_BOOTSTRAP_PASSWORD="):
            return line.split("=", 1)[1]
    raise RuntimeError("Missing local Authentik bootstrap password")


class AuthorizationRedirects(urllib.request.HTTPRedirectHandler):
    authorization_url = None

    def redirect_request(self, request, response, code, message, headers, new_url):
        if urllib.parse.urlsplit(new_url).path == "/application/o/authorize/":
            self.authorization_url = new_url
        return super().redirect_request(request, response, code, message, headers, new_url)


def load_json(opener, url):
    with opener.open(url, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status}")
        return json.load(response)


def sign_in(username):
    redirects = AuthorizationRedirects()
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies), redirects)
    with opener.open(f"{WEB}/oauth2/authorization/authentik", timeout=20) as response:
        flow_url = response.url
    if not redirects.authorization_url or urllib.parse.urlsplit(flow_url).path != "/if/flow/default-authentication-flow/":
        raise RuntimeError("Filebonsai did not reach the Authentik sign-in flow")

    flow = urllib.parse.urlsplit(flow_url)
    executor = urllib.parse.urlunsplit(
        (flow.scheme, flow.netloc, "/api/v3/flows/executor/default-authentication-flow/", flow.query, "")
    )
    if load_json(opener, executor)["component"] != "ak-stage-identification":
        raise RuntimeError("Unexpected Authentik identification stage")

    for body, expected in (
        ({"component": "ak-stage-identification", "uid_field": username}, "ak-stage-password"),
        ({"component": "ak-stage-password", "password": bootstrap_password()}, "xak-flow-redirect"),
    ):
        request = urllib.request.Request(
            executor,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json", "Referer": flow_url},
        )
        if load_json(opener, request)["component"] != expected:
            raise RuntimeError(f"Unexpected Authentik stage after {body['component']}")

    return opener, cookies, redirects.authorization_url


def check_owner():
    opener, cookies, authorization_url = sign_in("akadmin")

    with opener.open(authorization_url, timeout=20) as response:
        if urllib.parse.urlsplit(response.url).path != "/":
            raise RuntimeError("OIDC callback did not return to Filebonsai")
    if not any(cookie.name == "FILEBONSAI_SESSION" for cookie in cookies):
        raise RuntimeError("Filebonsai did not issue a session")

    session = load_json(opener, f"{WEB}/api/v1/auth/me")
    root = load_json(opener, f"{WEB}/api/v1/catalog/root")
    if not session.get("principalId") or root.get("kind") != "folder" or root.get("name") != "Library":
        raise RuntimeError("OIDC session lacks Catalog scope")


def authentik_test_user(username, *, delete=False):
    if delete:
        script = f'from authentik.core.models import User; User.objects.filter(username="{username}").delete()'
    else:
        script = (
            'import os; from authentik.core.models import User; '
            f'user = User.objects.create(username="{username}", name="Filebonsai OIDC check", is_active=True); '
            'user.set_password(os.environ["AUTHENTIK_BOOTSTRAP_PASSWORD"]); user.save()'
        )
    subprocess.run(
        ["docker", "compose", "exec", "-T", "authentik-worker", "ak", "shell", "-c", script],
        cwd=Path(__file__).parent,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )


def check_nonowner():
    username = f"filebonsai-oidc-check-{uuid.uuid4().hex}"
    authentik_test_user(username)
    try:
        opener, cookies, authorization_url = sign_in(username)
        try:
            opener.open(authorization_url, timeout=20)
        except urllib.error.HTTPError as error:
            if error.code != 403:
                raise RuntimeError(f"Unexpected non-owner callback status: {error.code}") from error
        else:
            raise RuntimeError("A non-owner completed the Filebonsai OIDC callback")
        if any(cookie.name == "FILEBONSAI_SESSION" for cookie in cookies):
            raise RuntimeError("Filebonsai issued a session to a non-owner")
        try:
            opener.open(f"{WEB}/api/v1/catalog/root", timeout=20)
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise RuntimeError(f"Unexpected non-owner Catalog status: {error.code}") from error
        else:
            raise RuntimeError("A non-owner accessed Catalog")
    finally:
        authentik_test_user(username, delete=True)


def main():
    opener = urllib.request.build_opener()
    with opener.open(f"{AUTHENTIK}/-/health/ready/", timeout=20) as response:
        if response.status != 200:
            raise RuntimeError("Authentik is not ready")
    discovery = load_json(opener, f"{AUTHENTIK}/application/o/filebonsai/.well-known/openid-configuration")
    if discovery["issuer"] != f"{AUTHENTIK}/application/o/filebonsai/":
        raise RuntimeError("Unexpected Authentik issuer")

    check_owner()
    check_nonowner()

    print("Authentik readiness and OIDC discovery: OK")
    print("Filebonsai OIDC sign-in, session, and workspace root: OK")
    print("Non-owner OIDC sign-in denied, with no Filebonsai session or Catalog access: OK")


if __name__ == "__main__":
    main()
