Test-only certificate and key for fake mail servers on 127.0.0.1. They secure
nothing: the key is public on purpose. Tests trust the certificate through
NODE_EXTRA_CA_CERTS (see the `test` script in package.json), so the mail code
under test verifies certificates exactly as it does in production.
