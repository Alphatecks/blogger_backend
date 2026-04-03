import type { Request, Response } from "express";
import { Router } from "express";

import { getAdminClient } from "../lib/db";
import { auth } from "../middleware/auth";

const blogRouter = Router();

type PostStatus = "draft" | "published";
type CommentStatus = "pending" | "approved" | "rejected";

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

blogRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = req.query.status as PostStatus | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const from = (Math.max(page, 1) - 1) * Math.max(limit, 1);
  const to = from + Math.max(limit, 1) - 1;

  try {
    const admin = getAdminClient();

    let query = admin
      .from("posts")
      .select(
        "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({
      data: data ?? [],
      meta: {
        page: Math.max(page, 1),
        limit: Math.max(limit, 1),
        total: count ?? 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch posts";
    res.status(500).json({ message });
  }
});

blogRouter.get("/:slug", async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params;

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("posts")
      .select(
        "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id"
      )
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    res.status(200).json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch post";
    res.status(500).json({ message });
  }
});

blogRouter.post("/", auth, async (req: Request, res: Response): Promise<void> => {
  const { title, content, excerpt, coverImageUrl, status } = req.body as {
    title?: string;
    content?: string;
    excerpt?: string;
    coverImageUrl?: string;
    status?: PostStatus;
  };

  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!title || !content) {
    res.status(400).json({ message: "title and content are required" });
    return;
  }

  const postStatus: PostStatus = status === "published" ? "published" : "draft";
  const slug = toSlug(title);

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("posts")
      .insert({
        author_id: req.userId,
        title: title.trim(),
        slug,
        excerpt: excerpt?.trim() || null,
        content: content.trim(),
        cover_image_url: coverImageUrl?.trim() || null,
        status: postStatus,
        published_at: postStatus === "published" ? new Date().toISOString() : null
      })
      .select(
        "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id"
      )
      .single();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: "Post created", data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create post";
    res.status(500).json({ message });
  }
});

blogRouter.put("/:id", auth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, content, excerpt, coverImageUrl, status } = req.body as {
    title?: string;
    content?: string;
    excerpt?: string;
    coverImageUrl?: string;
    status?: PostStatus;
  };

  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const admin = getAdminClient();
    const { data: existingPost, error: existingError } = await admin
      .from("posts")
      .select("id, author_id, status")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      res.status(400).json({ message: existingError.message });
      return;
    }

    if (!existingPost) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (existingPost.author_id !== req.userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const nextStatus: PostStatus =
      status === "published" || status === "draft" ? status : existingPost.status;

    const updatePayload: Record<string, string | null> = {};

    if (title) {
      updatePayload.title = title.trim();
      updatePayload.slug = toSlug(title);
    }

    if (typeof content === "string") {
      updatePayload.content = content.trim();
    }

    if (typeof excerpt === "string") {
      updatePayload.excerpt = excerpt.trim();
    }

    if (typeof coverImageUrl === "string") {
      updatePayload.cover_image_url = coverImageUrl.trim();
    }

    updatePayload.status = nextStatus;
    updatePayload.published_at =
      nextStatus === "published"
        ? new Date().toISOString()
        : null;

    const { data, error } = await admin
      .from("posts")
      .update(updatePayload)
      .eq("id", id)
      .select(
        "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id"
      )
      .single();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({ message: "Post updated", data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update post";
    res.status(500).json({ message });
  }
});

blogRouter.delete("/:id", auth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const admin = getAdminClient();
    const { data: existingPost, error: existingError } = await admin
      .from("posts")
      .select("id, author_id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      res.status(400).json({ message: existingError.message });
      return;
    }

    if (!existingPost) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    if (existingPost.author_id !== req.userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const { error } = await admin.from("posts").delete().eq("id", id);

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete post";
    res.status(500).json({ message });
  }
});

blogRouter.get("/:postId/comments", async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params;

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("comments")
      .select("id, post_id, author_name, author_email, content, status, created_at")
      .eq("post_id", postId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(200).json({ data: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch comments";
    res.status(500).json({ message });
  }
});

blogRouter.post("/:postId/comments", async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params;
  const { authorName, authorEmail, content } = req.body as {
    authorName?: string;
    authorEmail?: string;
    content?: string;
  };

  if (!authorName || !content) {
    res.status(400).json({ message: "authorName and content are required" });
    return;
  }

  try {
    const admin = getAdminClient();
    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, status")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      res.status(400).json({ message: postError.message });
      return;
    }

    if (!post || post.status !== "published") {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    const { data, error } = await admin
      .from("comments")
      .insert({
        post_id: postId,
        author_name: authorName.trim(),
        author_email: authorEmail?.trim() || null,
        content: content.trim(),
        status: "pending"
      })
      .select("id, post_id, author_name, author_email, content, status, created_at")
      .single();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(201).json({ message: "Comment submitted for moderation", data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit comment";
    res.status(500).json({ message });
  }
});

blogRouter.patch(
  "/comments/:commentId/status",
  auth,
  async (req: Request, res: Response): Promise<void> => {
    const { commentId } = req.params;
    const { status } = req.body as { status?: CommentStatus };

    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      res.status(400).json({ message: "Valid status is required" });
      return;
    }

    try {
      const admin = getAdminClient();
      const { data: comment, error: commentError } = await admin
        .from("comments")
        .select("id, post_id")
        .eq("id", commentId)
        .maybeSingle();

      if (commentError) {
        res.status(400).json({ message: commentError.message });
        return;
      }

      if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
      }

      const { data: post, error: postError } = await admin
        .from("posts")
        .select("id, author_id")
        .eq("id", comment.post_id)
        .maybeSingle();

      if (postError) {
        res.status(400).json({ message: postError.message });
        return;
      }

      if (!post || post.author_id !== req.userId) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }

      const { data, error } = await admin
        .from("comments")
        .update({ status })
        .eq("id", commentId)
        .select("id, post_id, author_name, author_email, content, status, created_at")
        .single();

      if (error) {
        res.status(400).json({ message: error.message });
        return;
      }

      res.status(200).json({ message: "Comment status updated", data });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update comment status";
      res.status(500).json({ message });
    }
  }
);

export { blogRouter };
