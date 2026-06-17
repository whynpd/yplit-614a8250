# Yplit Build Plan

Given the PRD scope is enormous, I'll build in waves so each wave is shippable on its own. Confirm and I'll start with Wave 1.

## Stack
- TanStack Start (template default) + Lovable Cloud (Postgres, Auth, Storage)
- Tailwind v4 with the PRD design tokens (navy/amber/coral/sage), Sora + Inter fonts
- Google OAuth + seeded admin email/password account
- Whitelist-only signup: only emails added by admin can sign in

## Wave 1 — Foundation (this turn)
- Enable Lovable Cloud, configure Google auth
- Design system in `src/styles.css` (dark-first, navy/amber/coral/sage, Sora/Inter, filmstrip card variant)
- Schema: `profiles`, `app_role` enum (`admin`,`member`), `user_roles`, `allowed_emails`, `has_role()`, trigger that auto-creates profile + rejects non-whitelisted signups
- Seeded admin account (you'll give me the email + password, or I default to `admin@yplit.app` / a password you set as a secret)
- Auth pages: `/auth` (Google + email/password), `/admin` (whitelist manager), `_authenticated` gate
- `My Trips` dashboard shell

## Wave 2 — Trips & Expenses
- Trips: create/join with `YPLIT-XXXXX` invite code, cover photo upload, members
- Trip dashboard, member list, balances
- Expenses: add/edit/delete, equal/unequal/share splits, category with filmstrip color, receipt upload
- Debt computation (server function) + simplification, settlements

## Wave 3 — Social / Games
- Memories (photo + caption + geo tied to expense)
- Games: Guess the Bill, Missions, Trip Market, Step-bet
- Trip Wrapped poster (the one gradient surface)

## Tradeoffs you should know
- Whitelist enforcement: Google sign-in completes first, then a server check deletes the auth user if email not whitelisted. There's a brief moment where the auth user exists. Acceptable for MVP.
- Seeded admin: I'll create it via a migration that calls `auth.admin.create_user`. You'll get the credentials in chat.
- Games & Trip Wrapped are large; Wave 3 will likely take several iterations.

## Questions before I start Wave 1
1. Admin email + password to seed? (or default `admin@yplit.app` + a password I store as a secret and show you once)
2. OK to proceed wave-by-wave, or do you want me to attempt waves 1+2 in this turn (slower, more risk)?
