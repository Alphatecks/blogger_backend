import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { getAdminClient } from "../lib/db";
import { auth } from "../middleware/auth";

const blogRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

type PostStatus = "draft" | "published";
type CommentStatus = "pending" | "approved" | "rejected";
type FeedPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string;
  is_top_header?: boolean;
};
const postCoverBucket = process.env.BLOGGER_POST_COVER_BUCKET || "blogger-post-covers";
let postCoverBucketReady = false;

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const estimateReadTime = (content: string): string => {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} mins read`;
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const dayWithOrdinal = (day: number): string => {
  if (day > 3 && day < 21) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};

const formatHeaderDate = (dateValue: string | null): string | null => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = date.toLocaleString("en-US", { month: "short" });
  return `${dayWithOrdinal(date.getDate())} ${month} ${date.getFullYear()}`;
};

const toHeaderSubtitle = (excerpt: string | null, content: string): string => {
  if (excerpt?.trim()) {
    return excerpt.trim();
  }

  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) {
    return compact;
  }

  return `${compact.slice(0, 177)}...`;
};

const clearTopHeaderForOtherPosts = async (currentPostId: string): Promise<void> => {
  const admin = getAdminClient();
  const { error } = await admin
    .from("posts")
    .update({ is_top_header: false })
    .neq("id", currentPostId)
    .eq("is_top_header", true);

  if (error) {
    throw new Error(error.message);
  }
};

const ensurePostCoverBucketExists = async (): Promise<void> => {
  const admin = getAdminClient();

  if (postCoverBucketReady) {
    return;
  }

  const { error: bucketLookupError } = await admin.storage.getBucket(postCoverBucket);
  if (!bucketLookupError) {
    postCoverBucketReady = true;
    return;
  }

  if (!bucketLookupError.message.toLowerCase().includes("not found")) {
    throw new Error(`Failed to access post cover bucket: ${bucketLookupError.message}`);
  }

  const { error: createBucketError } = await admin.storage.createBucket(postCoverBucket, {
    public: true
  });

  if (createBucketError) {
    const normalizedMessage = createBucketError.message.toLowerCase();
    if (!normalizedMessage.includes("already exists")) {
      throw new Error(`Failed to create post cover bucket: ${createBucketError.message}`);
    }
  }

  postCoverBucketReady = true;
};

const uploadPostCoverIfPresent = async (
  file?: Express.Multer.File
): Promise<string | null> => {
  if (!file) {
    return null;
  }

  const admin = getAdminClient();
  await ensurePostCoverBucketExists();

  const safeExtension = file.mimetype.split("/")[1] || "jpg";
  const filePath = `posts/${Date.now()}-${randomUUID()}.${safeExtension}`;

  const { error } = await admin.storage.from(postCoverBucket).upload(filePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });

  if (error) {
    throw new Error(`Failed to upload post cover image: ${error.message}`);
  }

  const { data } = admin.storage.from(postCoverBucket).getPublicUrl(filePath);
  return data.publicUrl;
};

const dedupeAndClean = (values: string[]): string[] =>
  Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));

const getPostTagMap = async (
  postIds: string[]
): Promise<Record<string, string[]>> => {
  if (!postIds.length) {
    return {};
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("post_tags")
    .select("post_id, tags(name)")
    .in("post_id", postIds);

  if (error) {
    throw new Error(error.message);
  }

  const tagMap: Record<string, string[]> = {};
  for (const row of (data ?? []) as Array<{
    post_id: string;
    tags: Array<{ name: string }> | { name: string } | null;
  }>) {
    if (!tagMap[row.post_id]) {
      tagMap[row.post_id] = [];
    }

    const normalizedTags = Array.isArray(row.tags)
      ? row.tags
      : row.tags
        ? [row.tags]
        : [];
    const names = normalizedTags.map((tag) => tag.name).filter(Boolean);
    tagMap[row.post_id].push(...names);
  }

  for (const postId of Object.keys(tagMap)) {
    tagMap[postId] = dedupeAndClean(tagMap[postId]);
  }

  return tagMap;
};

const getAuthorMap = async (
  authorIds: string[]
): Promise<Record<string, { fullName: string; avatarUrl: string | null }>> => {
  if (!authorIds.length) {
    return {};
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("bloggers")
    .select("user_id, full_name, avatar_url")
    .in("user_id", authorIds);

  if (error) {
    throw new Error(error.message);
  }

  const authorMap: Record<string, { fullName: string; avatarUrl: string | null }> = {};
  for (const row of (data ?? []) as Array<{
    user_id: string;
    full_name: string;
    avatar_url: string | null;
  }>) {
    authorMap[row.user_id] = {
      fullName: row.full_name,
      avatarUrl: row.avatar_url
    };
  }

  return authorMap;
};

const ensureTags = async (tagNames: string[]): Promise<string[]> => {
  if (!tagNames.length) {
    return [];
  }

  const admin = getAdminClient();
  const normalized = dedupeAndClean(tagNames);

  const { data: inserted, error: insertError } = await admin
    .from("tags")
    .upsert(
      normalized.map((name) => ({ name })),
      { onConflict: "name" }
    )
    .select("id, name");

  if (insertError) {
    throw new Error(insertError.message);
  }

  return ((inserted ?? []) as Array<{ id: string }>).map((row) => row.id);
};

const syncPostTags = async (postId: string, tags: string[]): Promise<void> => {
  const tagNames = dedupeAndClean(tags);
  const admin = getAdminClient();

  const { error: deleteError } = await admin.from("post_tags").delete().eq("post_id", postId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!tagNames.length) {
    return;
  }

  const tagIds = await ensureTags(tagNames);
  if (!tagIds.length) {
    return;
  }

  const { error: insertError } = await admin.from("post_tags").insert(
    tagIds.map((tagId) => ({
      post_id: postId,
      tag_id: tagId
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
};

const parseTagsInput = (raw: unknown, category: unknown): string[] => {
  const fromTagsArray =
    Array.isArray(raw) && raw.every((item) => typeof item === "string")
      ? (raw as string[])
      : [];
  const fromSingleTag = typeof raw === "string" ? [raw] : [];
  const fromCategory = typeof category === "string" ? [category] : [];
  return dedupeAndClean([...fromTagsArray, ...fromSingleTag, ...fromCategory]);
};

blogRouter.get("/feed", async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 8);
  const search = (req.query.search as string | undefined)?.trim();
  const category = (req.query.category as string | undefined)?.trim();
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
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const posts = (data ?? []) as FeedPost[];
    let filteredPosts = posts;
    const tagMap = await getPostTagMap(posts.map((post) => post.id));

    if (category && category.toLowerCase() !== "all") {
      filteredPosts = posts.filter((post) =>
        (tagMap[post.id] ?? []).some((tag) => tag.toLowerCase() === category.toLowerCase())
      );
    }

    const authorMap = await getAuthorMap(filteredPosts.map((post) => post.author_id));
    const defaultAvatarUrl = process.env.BLOGGER_DEFAULT_AVATAR_URL || null;

    const feed = filteredPosts.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.cover_image_url,
      category: (tagMap[post.id] ?? [])[0] ?? "General",
      categories: tagMap[post.id] ?? [],
      author: {
        id: post.author_id,
        fullName: authorMap[post.author_id]?.fullName ?? "Kairos Summit",
        avatarUrl: authorMap[post.author_id]?.avatarUrl ?? defaultAvatarUrl
      },
      readTime: estimateReadTime(post.content),
      publishedAt: post.published_at,
      createdAt: post.created_at
    }));

    res.status(200).json({
      data: feed,
      meta: {
        page: Math.max(page, 1),
        limit: Math.max(limit, 1),
        total: count ?? feed.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch feed";
    res.status(500).json({ message });
  }
});

blogRouter.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.from("tags").select("id, name").order("name", {
      ascending: true
    });

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    const categories = (data ?? []).map((row) => row.name);
    res.status(200).json({
      data: ["All", ...categories]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch categories";
    res.status(500).json({ message });
  }
});

blogRouter.get("/top-header", async (_req: Request, res: Response): Promise<void> => {
  try {
    const admin = getAdminClient();
    let { data, error } = await admin
      .from("posts")
      .select(
        "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id, is_top_header"
      )
      .eq("status", "published")
      .eq("is_top_header", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (!data) {
      const fallback = await admin
        .from("posts")
        .select(
          "id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at, updated_at, author_id, is_top_header"
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ message: "No published post available for top header" });
      return;
    }

    const authorMap = await getAuthorMap([data.author_id]);
    const defaultAvatarUrl = process.env.BLOGGER_DEFAULT_AVATAR_URL || null;

    res.status(200).json({
      data: {
        id: data.id,
        slug: data.slug,
        title: data.title,
        subtitle: toHeaderSubtitle(data.excerpt, data.content),
        coverImageUrl: data.cover_image_url,
        author: {
          id: data.author_id,
          fullName: authorMap[data.author_id]?.fullName ?? "Kairos Summit",
          avatarUrl: authorMap[data.author_id]?.avatarUrl ?? defaultAvatarUrl
        },
        publishedAt: data.published_at,
        publishedDateLabel: formatHeaderDate(data.published_at),
        updatedAt: data.updated_at,
        updateDateLabel: formatHeaderDate(data.updated_at),
        badgeLabel: "update"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch top header";
    res.status(500).json({ message });
  }
});

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

    const tagMap = await getPostTagMap([data.id]);
    const authorMap = await getAuthorMap([data.author_id]);
    const defaultAvatarUrl = process.env.BLOGGER_DEFAULT_AVATAR_URL || null;

    res.status(200).json({
      data: {
        ...data,
        categories: tagMap[data.id] ?? [],
        readTime: estimateReadTime(data.content),
        author: {
          id: data.author_id,
          fullName: authorMap[data.author_id]?.fullName ?? "Kairos Summit",
          avatarUrl: authorMap[data.author_id]?.avatarUrl ?? defaultAvatarUrl
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch post";
    res.status(500).json({ message });
  }
});

blogRouter.post(
  "/",
  auth,
  upload.single("coverImage"),
  async (req: Request, res: Response): Promise<void> => {
  const { title, content, excerpt, coverImageUrl, status, tags, category, isTopHeader } = req.body as {
    title?: string;
    content?: string;
    excerpt?: string;
    coverImageUrl?: string;
    status?: PostStatus;
    tags?: string[] | string;
    category?: string;
    isTopHeader?: boolean | string;
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
  const shouldBeTopHeader = normalizeBoolean(isTopHeader) ?? false;
  const slug = toSlug(title);

  try {
    const uploadedCoverImageUrl = await uploadPostCoverIfPresent(req.file);
    const resolvedCoverImageUrl = uploadedCoverImageUrl || coverImageUrl?.trim() || null;
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("posts")
      .insert({
        author_id: req.userId,
        title: title.trim(),
        slug,
        excerpt: excerpt?.trim() || null,
        content: content.trim(),
        cover_image_url: resolvedCoverImageUrl,
        status: postStatus,
        is_top_header: shouldBeTopHeader,
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

    if (shouldBeTopHeader) {
      await clearTopHeaderForOtherPosts(data.id);
    }

    await syncPostTags(data.id, parseTagsInput(tags, category));
    const tagMap = await getPostTagMap([data.id]);

    res.status(201).json({
      message: "Post created",
      data: {
        ...data,
        categories: tagMap[data.id] ?? []
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create post";
    res.status(500).json({ message });
  }
}
);

blogRouter.put(
  "/:id",
  auth,
  upload.single("coverImage"),
  async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, content, excerpt, coverImageUrl, status, tags, category, isTopHeader } = req.body as {
    title?: string;
    content?: string;
    excerpt?: string;
    coverImageUrl?: string;
    status?: PostStatus;
    tags?: string[] | string;
    category?: string;
    isTopHeader?: boolean | string;
  };

  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const uploadedCoverImageUrl = await uploadPostCoverIfPresent(req.file);
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
    const parsedTopHeader = normalizeBoolean(isTopHeader);

    const updatePayload: Record<string, string | boolean | null> = {};

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

    if (uploadedCoverImageUrl) {
      updatePayload.cover_image_url = uploadedCoverImageUrl;
    } else if (typeof coverImageUrl === "string") {
      updatePayload.cover_image_url = coverImageUrl.trim();
    }

    updatePayload.status = nextStatus;
    if (parsedTopHeader !== undefined) {
      updatePayload.is_top_header = parsedTopHeader;
    }
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

    if (parsedTopHeader === true) {
      await clearTopHeaderForOtherPosts(data.id);
    }

    if (tags !== undefined || category !== undefined) {
      await syncPostTags(id, parseTagsInput(tags, category));
    }

    const tagMap = await getPostTagMap([data.id]);
    res.status(200).json({
      message: "Post updated",
      data: {
        ...data,
        categories: tagMap[data.id] ?? []
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update post";
    res.status(500).json({ message });
  }
}
);

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
