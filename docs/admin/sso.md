# Identity providers

How to connect yartt to the company's accounts. What yartt does with
them — who comes in, the day-long session, the daily check — is in
[installation](install.md#sign-in-through-the-companys-identity-provider).
Every provider needs the same three things from you, and gives yartt the
same three back:

- **To the provider:** a web application (a confidential client) with the
  redirect URI `<PUBLIC_URL>/api/sso/callback` — exactly, e.g.
  `https://tasks.example.com/api/sso/callback`.
- **To yartt:** `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and
  `OIDC_NAME` for the button.

yartt asks for the scopes `openid email profile`, plus `offline_access`
when the provider offers it — the refresh token for the daily check. It
reads `sub`, `email` (or, without it, `preferred_username` if it is an
address), `email_verified`, `name`, `locale` and `zoneinfo`. An address
the provider vouches for (`email_verified: true`) finds or creates the
person on their first sign-in; without one — Entra never sends
`email_verified` — they confirm their work email by a link once.

## Microsoft Entra ID

1. **Entra admin center → App registrations → New registration.** Any
   name ("yartt"); accounts in this organizational directory only; redirect
   URI — platform **Web**, `<PUBLIC_URL>/api/sso/callback`.
2. **Certificates & secrets → New client secret.** Its *value* is
   `OIDC_CLIENT_SECRET`; mind its expiry — yartt stops letting people in
   when it expires, so put a reminder on your calendar.
3. **Token configuration → Add optional claim → ID → `email`.** Without it
   yartt falls back to the sign-in name.
4. **API permissions:** Microsoft Graph, delegated — `openid`, `email`,
   `profile`, `offline_access`; grant admin consent.
5. **Enterprise applications → yartt → Properties → Assignment required:
   Yes**, then **Users and groups**: assign the people or groups who should
   use yartt. Without it, everyone in the directory can come in.

```sh
OIDC_ISSUER=https://login.microsoftonline.com/<directory (tenant) ID>/v2.0
OIDC_CLIENT_ID=<application (client) ID>
OIDC_CLIENT_SECRET=<the secret's value>
OIDC_NAME=Microsoft
```

Blocking someone's sign-in or deleting them in Entra makes their refresh
token fail, and the next daily check takes them out of yartt.

## Google Workspace

1. **Google Cloud console**, a project of your organization. **APIs &
   Services → OAuth consent screen:** user type **Internal** — only your
   Workspace accounts can sign in.
2. **Credentials → Create credentials → OAuth client ID:** type **Web
   application**, authorized redirect URI `<PUBLIC_URL>/api/sso/callback`.

```sh
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=<client ID>.apps.googleusercontent.com
OIDC_CLIENT_SECRET=<client secret>
OIDC_NAME=Google
EMAIL_DOMAINS=example.com
```

Google has no `offline_access`: yartt asks for offline access the Google
way, which shows the consent screen at every sign-in. Set
`EMAIL_DOMAINS` to your Workspace domains as a second fence. Suspending a
user should revoke their tokens; check it once on a test account (below).

## Keycloak

1. A realm for the company (or an existing one). **Clients → Create
   client:** OpenID Connect, client ID `yartt`; **Client authentication**
   on, **Standard flow** on; **Valid redirect URIs**
   `<PUBLIC_URL>/api/sso/callback`.
2. **Advanced → Proof Key for Code Exchange Code Challenge Method:** S256.
3. **Credentials** — the client secret.

```sh
OIDC_ISSUER=https://sso.example.com/realms/<realm>
OIDC_CLIENT_ID=yartt
OIDC_CLIENT_SECRET=<client secret>
OIDC_NAME=Keycloak
```

Disabling a user in Keycloak makes their refresh token fail at the next
daily check; checked on Keycloak 26. Who may use yartt: by default
everyone in the realm; to narrow it, a client role and an authentication
flow that requires it, or a realm of its own.

## LDAP or Active Directory, through Keycloak

yartt does not speak LDAP: it would see people's passwords. Keycloak
(or Authentik) reads the directory and speaks OpenID Connect to yartt:

1. **User federation → Add Ldap providers.** Vendor (Active Directory or
   other), connection URL (`ldaps://dc.example.com`), bind DN and its
   password, users DN; **Edit mode: READ_ONLY**. Map the `mail` attribute
   to email and turn **Trust Email** on, if the directory's addresses are
   real mailboxes.
2. Set up the client as in [Keycloak](#keycloak) above and point yartt at it.

A person disabled in the directory cannot sign in through Keycloak. Check
once on a test account that their refresh token fails too (below); if it
does not, the day-long session still keeps them out by the next day.

## SAML, through Keycloak

A provider that speaks only SAML (ADFS, an older Okta setup) is bridged
the same way: in Keycloak, **Identity providers → SAML v2.0**, import the
provider's metadata, and set up the client for yartt as in
[Keycloak](#keycloak). People then press the provider's button on
Keycloak's page, or set it as the default with **Identity provider
redirector** in the browser flow.

## Okta, Authentik and others

Any OpenID Connect provider works: a web application with the redirect
URI above, the authorization code flow, PKCE allowed, refresh tokens
(`offline_access`) on, and assignment to the people who should use yartt.

## Check it once

On a test account, before telling everyone:

1. **Sign in** with it: yartt asks for the work email and sends a link;
   opened in the same browser, it opens My day, and in the profile the
   name is the provider's and the email the one confirmed.
2. **Turn it off** at the provider (block, disable, suspend). Within a
   day — the check runs every hour for people last asked a day ago — My
   team marks it "refused by the provider", its sessions end and its bots
   stop.
3. **Turn it back on** and sign in: it works again, bots included.
