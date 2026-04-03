# Kairos Summit Blogger Backend

Express + TypeScript backend for blogger auth, blog posts, and comment moderation.

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
- `BLOGGER_AVATAR_BUCKET`
- `BLOGGER_RESET_PASSWORD_REDIRECT_URL`

## Database Setup (Required)

1. Open Supabase SQL Editor.
2. Run the SQL from `supabase/schema.sql`.

This creates:

- `bloggers`
- `posts`
- `comments`
- `tags`
- `post_tags`

with indexes, triggers, and RLS policies.

## API Routes

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `GET /api/auth/me` (Bearer token required)

### Blogs

- `GET /api/blogs`
- `GET /api/blogs/:slug`
- `POST /api/blogs` (Bearer token required)
- `PUT /api/blogs/:id` (Bearer token required, author only)
- `DELETE /api/blogs/:id` (Bearer token required, author only)

### Comments

- `GET /api/blogs/:postId/comments`
- `POST /api/blogs/:postId/comments`
- `PATCH /api/blogs/comments/:commentId/status` (Bearer token required, post author only)
