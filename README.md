# Kairos Summit Blogger Backend

Express + TypeScript backend for blogger auth, blog posts, comment moderation, and event seat-list registration.

## Run

- `npm install`
- `npm run dev`

Production:

- `npm run build`
- `npm run start`

## Environment Variables

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for DB writes and avatar upload)
- `ALLOWED_BLOGGER_EMAIL_DOMAIN`
- `BLOGGER_AVATAR_BUCKET` (bucket name only, not URL)
- `BLOGGER_DEFAULT_AVATAR_URL` (used when no avatar is uploaded)
- `BLOGGER_POST_COVER_BUCKET` (stores uploaded local post cover images)
- `BLOGGER_RESET_PASSWORD_REDIRECT_URL`
- `KAIROS_EVENT_SLUG` (optional, defaults to `remnants-reborn-2026`)
- `PUBLIC_BASE_URL` (used to build the logo URL in confirmation mail)
- `KAIROS_SITE_URL` (optional, defaults to `https://kairosummit.org`)
- `RESEND_API_KEY` (sends the seat list confirmation after a successful registration)
- `RESEND_FROM` (optional, defaults to `Kairos Summit <event@kairosummit.org>`)
- `EMAIL_LOGO_URL` (optional override for the logo in mail)

## Database Setup (Required)

1. Open Supabase SQL Editor.
2. Run the SQL from `supabase/schema.sql`.

This creates:

- `bloggers`
- `posts`
- `comments`
- `tags`
- `post_tags`
- `event_registrations`
- `post_visits`

with indexes, triggers, and RLS policies.

## API Routes

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `GET /api/auth/me` (Bearer token required)

### Blogs

- `GET /api/blogs`
- `GET /api/blogs/feed` (UI feed cards with category/search/pagination)
- `GET /api/blogs/categories` (category tabs, includes `All`)
- `GET /api/blogs/top-header` (hero/top-header card payload)
- `GET /api/blogs/visits/total` (Bearer token required, dashboard visit count)
- `GET /api/blogs/stats` (Bearer token required)
- `GET /api/blogs/analytics` (Bearer token required)
- `GET /api/blogs/:slug`
- `POST /api/blogs` (Bearer token required)
- `PUT /api/blogs/:id` (Bearer token required, author only)
- `DELETE /api/blogs/:id` (Bearer token required, author only)

`POST /api/blogs` and `PUT /api/blogs/:id` support:

- JSON body with `coverImageUrl`, or
- `multipart/form-data` with local file field `coverImage`.
- `isTopHeader` (`true`/`false`) to control the homepage top header post.

### Comments

- `GET /api/blogs/:identifier/comments` (`identifier` can be slug or post id)
- `POST /api/blogs/:identifier/comments` (`identifier` can be slug or post id)
- `PATCH /api/blogs/comments/:commentId/status` (Bearer token required, post author only)

Set `BLOGGER_COMMENT_AUTO_APPROVE=true` to publish new comments immediately (default true).

### Registrations (Remnants Reborn seat list)

- `POST /api/registrations` (public)
- `GET /api/registrations/event` (public event details + registered count)
- `GET /api/registrations` (Bearer token required, paginated seat list)

`POST /api/registrations` body:

```json
{
  "firstName": "Ada",
  "lastName": "Okafor",
  "email": "ada@example.com",
  "phone": "+2348012345678",
  "occupation": "Designer",
  "comingFrom": "Port Harcourt",
  "whoToldYou": "A friend"
}
```

`whoToldYou` is optional. `comingFrom` defaults to `Port Harcourt` if omitted. Snake_case keys (`first_name`, `last_name`, `coming_from`, `who_told_you`) are also accepted. Email is unique per event. Duplicate emails return `409`.

A successful `POST /api/registrations` also sends a confirmation through Resend to the registrant. The seat is saved even if mail fails. The JSON includes `emailSent`. Brand files are served from `/brand/logo.png`.
