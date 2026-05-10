# Security Policy

## Supported Versions

The following versions of Apollo Discord Bot v2 are currently supported with security updates:

| Version | Supported |
|---------|-----------|
| 2.0.x   | ✅ Active support |
| < 2.0   | ❌ No longer supported |

## Reporting a Vulnerability

We take the security of this project seriously. If you believe you have found a security vulnerability, please report it to us responsibly.

### How to Report

1. **Do not** disclose the vulnerability publicly
2. **Do not** create public issues or pull requests about it
3. **Do** send a detailed report to the project maintainers

### Reporting Channels

For security vulnerabilities, please use one of the following methods:

- **Preferred**: Open a private security advisory through GitHub
- **Alternative**: Contact the maintainers directly via email

When reporting, please include:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** or mitigation (if you have any)

### What to Expect

After you submit a vulnerability report, you can expect:

1. **Acknowledgment**: Within 24-48 hours, we will acknowledge receipt of your report
2. **Initial Assessment**: Within 3-5 business days, we will assess the vulnerability
3. **Status Updates**: We will keep you informed about the progress
4. **Resolution**: We will work to resolve the issue as quickly as possible

## Security Best Practices

### For Users

1. **Keep your bot token secure**
   - Never share your Discord bot token publicly
   - Store tokens in environment variables, not in code
   - Rotate tokens immediately if they are compromised

2. **Use proper permissions**
   - Only grant the bot permissions it needs
   - Regularly review bot permissions in your server

3. **Multi-instance deployment**
   - Use separate tokens per environment (dev/staging/production)
   - Secure Redis with authentication (`REDIS_URL=redis://:password@host:6379`)
   - Secure PostgreSQL with SSL and strong passwords
   - Use network isolation between pods (Kubernetes NetworkPolicies)

4. **Monitor bot activity**
   - Review bot logs regularly
   - Set up alerts for suspicious activity
   - Monitor BullMQ queue depth and failure rates

5. **Keep dependencies updated**
   - Regularly run `pnpm update` to get security patches
   - Review `pnpm audit` output
   - Check the `pnpm-workspace.yaml` overrides for pinned security fixes

### For Contributors

1. **Follow secure coding practices**
   - Validate all user inputs (Discord interactions are already typed, but always validate)
   - Use parameterized queries for database operations (Knex handles this automatically)
   - Never hardcode secrets or credentials
   - Never commit `.env` files or tokens

2. **Database security**
   - SQLite: file permissions must restrict access to the bot user only
   - PostgreSQL: use connection pooling with least-privilege database users
   - All DB writes go through the async bridge in `src/utils/db.js` — never bypass it

3. **Redis security**
   - Redis instances should require authentication (`requirepass`)
   - Use separate Redis databases or key prefixes for different environments
   - Lock keys use prefix `apollo:lock:`, queue keys use the configured prefix
   - Spam/raid tracking keys auto-expire via TTL

4. **Use HTTPS for external requests**
   - All API calls should use secure connections
   - Plugin downloads from registries must validate sources

5. **Review code for security issues**
   - Check for injection vulnerabilities
   - Ensure proper error handling (no stack traces in user-facing messages)
   - Validate file paths and permissions (transcript file paths)

## Security Features

### Current Security Measures

1. **Token-based authentication**
   - Discord bot tokens for authentication
   - Environment variable storage (never in code)

2. **Permission system**
   - Discord's permission system for access control
   - Role-based permissions for all commands
   - Owner-only commands (`/reload`, `/plugin`)

3. **Input validation**
   - Discord.js slash commands provide typed inputs
   - Duration strings are validated with regex (`/^(\d+)([mhdw])$/`)
   - User IDs validated as 17-19 digit snowflakes

4. **Dependency security**
   - `pnpm-workspace.yaml` contains security overrides for known vulnerabilities
   - GitHub Actions CI runs Trivy vulnerability scanning on Docker images
   - GitHub Actions CI runs CodeQL SAST analysis
   - `core-js` and `msgpackr-extract` build scripts are explicitly approved

5. **CI/CD security**
   - Docker images are signed and scanned before publishing
   - SBOM (Software Bill of Materials) generated for supply chain transparency
   - Multi-stage Docker builds minimize attack surface
   - All workflows run on `ubuntu-latest` with Node 26

6. **Infrastructure security**
   - PostgreSQL connection pooling with Knex
   - Redis AOF persistence with optional authentication
   - BullMQ queues have configurable retry and backoff
   - Leader election uses Redis SET NX PX with automatic lock expiration

### Secure Defaults

- Single-instance mode uses SQLite (file-based, no network exposure)
- Multi-instance mode requires explicit `DB_TYPE=postgres` and `REDIS_URL` configuration
- All schedulers use distributed locks to prevent duplicate execution
- Spam/raid detection data auto-expires via Redis TTL
- Ticket transcripts are stored as local JSON files (no external upload unless configured)

## Known Security Considerations

### Discord API
- Bot tokens have full access to the bot's capabilities
- Compromised tokens can lead to unauthorized bot control
- Always use the principle of least privilege
- Gateway intents grant access to specific event types — only request what's needed

### Multi-Instance Architecture
- **Leader election**: One gateway pod is active at a time. If the leader crashes, lock auto-expires (30s TTL). During failover, there is a brief window without a gateway connection.
- **Shared database**: PostgreSQL must be configured with proper access controls. SQLite does not support multi-writer and will corrupt under concurrent access.
- **Redis**: All pods share the same Redis instance. Redis compromise would expose queue contents, locks, and cross-pod events.
- **Worker callbacks**: Workers respond to interactions via Discord REST API — no direct user access.

### Node.js Environment
- Keep Node.js version updated (CI uses Node 26)
- Monitor npm package vulnerabilities
- Use `pnpm audit` regularly

### Third-party Dependencies
- Review dependencies before adding
- Keep dependencies minimal
- Monitor for known vulnerabilities
- Pin critical security patches in `pnpm-workspace.yaml`

## CI/CD Security Pipeline

This project has multiple CI security gates:

| Workflow | Security Check |
|----------|---------------|
| CI (`ci.yml`) | ESLint, Vitest, dependency audit |
| Docker CI (`docker-ci.yml`) | Trivy vulnerability scan, SBOM generation |
| Security (`security.yml`) | CodeQL analysis, SAST scanning, dependency review |
| Docker Release (`docker-release.yml`) | Cosign signature, multi-platform build, provenance attestation |

## External Security Resources

- [Discord Developer Portal](https://discord.com/developers/applications)
- [Node.js Security](https://nodejs.org/en/security/)
- [OWASP Security Guidelines](https://owasp.org/)
- [Redis Security](https://redis.io/docs/management/security/)
- [BullMQ Security](https://docs.bullmq.io/guide/connections)
- [Knex Security](https://knexjs.org/guide/raw.html#raw-param-binding)

## Acknowledgments

We would like to thank:
- Security researchers who responsibly report vulnerabilities
- GitHub Dependabot for automated dependency monitoring
- The open-source security community

## Contact

For security-related questions or concerns, please:
1. Check this document first
2. Review existing issues
3. Contact maintainers privately

---

**Note**: This security policy may be updated as the project evolves. Please check back regularly for updates.

Last updated: 2026
