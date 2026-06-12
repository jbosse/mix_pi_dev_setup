# PiDevSetup — Specification

_This document defines the product requirements for PiDevSetup. Update it sprint by sprint as the domain is understood and features are built. The Architect references this during planning; the Security agent references it for domain-specific compliance requirements._

---

## Overview

PiDevSetup is a Phoenix 1.8 + LiveView web application. The product scope is defined during sprint planning — see `/docs/project_memory.md` for what has shipped.

---

## Core Domain Concepts

_TBD — to be defined sprint by sprint during planning interviews._

---

## Technical Stack

Phoenix 1.8 + LiveView, PostgreSQL/Ecto, Req, Tailwind CSS v4, esbuild.

---

## Authentication

Standard `phx.gen.auth` — email/password with `current_scope`. Extensions (TFA, passkeys, SSO) are future sprints if needed.

---

## Compliance & Security Requirements

_TBD — add domain-specific compliance requirements here as they are identified during planning._
