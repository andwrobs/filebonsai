# 0003: Organize Java by capability

Status: accepted

Each capability owns its domain, application, web, persistence, and support boundaries. Cross-capability infrastructure belongs in `platform`; a generic `shared` package is not a default destination. Public DTOs, domain values, and jOOQ records remain separate.
