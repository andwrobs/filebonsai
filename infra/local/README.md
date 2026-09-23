# Local development stack

This Compose stack runs the Filebonsai web client, PostgreSQL-backed API, Authentik
server and worker, and a separate Authentik PostgreSQL database. Docker Compose v2,
OpenSSL, curl, and Python 3 are needed on the host. Allocate at least 2 CPU cores and
2 GiB of memory to Docker.

From the repository root:

```sh
./infra/local/up.sh
python3 infra/local/check.py
```

`up.sh` is repeatable. The first run creates ignored, mode-600 local secrets, applies
the Authentik OIDC provider blueprint, builds the backend and web images, and creates
the Filebonsai local owner and Library root. Later runs preserve the databases and
stored objects. It refuses to bind an existing Filebonsai installation to a different
Authentik administrator identity.

| Service | Local URL |
| --- | --- |
| Filebonsai web | http://localhost:15173/ |
| Filebonsai API | http://localhost:18080/ |
| Authentik | http://authentik.localhost:9000/ |

Open the web URL and choose **Continue with Authentik**. The Authentik administrator
username is `akadmin`; its generated local password is in the ignored
`infra/local/.env` file under `AUTHENTIK_BOOTSTRAP_PASSWORD`. The separate Filebonsai
local-owner password is in the ignored `infra/local/secrets/owner-password` file.
Neither password is committed or printed by the setup script. No browser-based
one-time setup is needed. If you change the Authentik administrator password, update
the ignored `.env` entry before running `check.py` again; changing that entry does not
rotate the account password.

`check.py` performs an Authentik sign-in through the authorization-code flow and
checks that the resulting Filebonsai session can read the Library root. It also
creates and removes a temporary Authentik user to verify that other subjects get
no Filebonsai session or Catalog access. It prints only pass/fail results.

All published ports bind to loopback. The stack uses plain HTTP and sets the
Filebonsai session cookie's `Secure` flag off for this loopback environment only.
The generated credentials and Compose setup are for local development, not an
internet-facing deployment.

To stop the containers while retaining volumes:

```sh
cd infra/local
docker compose down
```
