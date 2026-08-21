# Backend Requirements — Production Deployment & Operations

## 1. Runtime

Use a supported LTS Node.js version.

Pin runtime versions in:

- package.json
- Docker image
- CI configuration

## 2. Docker

Provide a production Dockerfile.

Do not run the application as root where practical.

Use multi-stage builds.

Production image should contain only required runtime dependencies.

## 3. Environment Separation

Separate:

- development
- test
- staging
- production

Never use production credentials in local development.

## 4. Database

Production PostgreSQL must have:

- automated backups
- point-in-time recovery where available
- connection limits
- monitoring
- migration strategy

## 5. Migrations

Deployment sequence should safely coordinate:

1. deploy compatible backend
2. run migration
3. verify
4. enable new behavior

Avoid migrations that require long downtime.

## 6. Redis

Configure:

- authentication
- persistence according to requirements
- memory policy
- monitoring

Redis is not the system of record.

If Redis is lost, PostgreSQL must retain the authoritative schedule/business data.

## 7. Queue Workers

Run workers separately from the API process where appropriate.

Workers must support:

- restart
- retry
- graceful shutdown
- health monitoring

## 8. Scaling

The API must be stateless.

Multiple API instances should be able to run simultaneously.

Do not store user/session state only in process memory.

## 9. Reverse Proxy

Production should use HTTPS.

Use a reverse proxy/load balancer such as Nginx, cloud load balancer, or managed equivalent.

## 10. CI/CD

Pipeline should run:

- install
- lint
- type-check
- unit tests
- integration tests
- build
- migration validation
- security/dependency checks

Deployment should stop on critical failures.

## 11. Secrets

Use a secrets manager or secure deployment environment.

Never commit secrets.

## 12. Backups

Define:

- backup frequency
- retention
- restore procedure
- restore testing

A backup that has never been restored is not considered fully verified.

## 13. Monitoring

Monitor:

- CPU
- memory
- request latency
- HTTP errors
- DB connections
- DB query latency
- Redis health
- queue depth
- notification failures

## 14. Logging Retention

Define production log retention.

Avoid storing sensitive information in logs.

## 15. Incident Handling

Document procedures for:

- database outage
- Redis outage
- notification provider outage
- authentication compromise
- migration failure
- worker backlog

## 16. Dependency Security

Regularly update dependencies.

Use automated vulnerability scanning.

Critical security vulnerabilities must have an explicit remediation process.

## 17. Rate Limits

Rate limits must be configurable by environment.

Production limits should be based on expected traffic rather than arbitrary defaults.

## 18. Disaster Recovery

Define:

- Recovery Point Objective
- Recovery Time Objective
- backup restore process
- migration recovery process

## 19. Production Checklist

Before release:

- environment validation
- migrations verified
- backups verified
- HTTPS verified
- CORS verified
- cookies verified
- rate limiting verified
- logs verified
- health checks verified
- workers verified
- push notifications verified
- monitoring verified
