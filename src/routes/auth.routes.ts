import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { supabase, supabaseAdmin } from "../config/supabase";
import { auth } from "../middleware/auth";

const authRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const allowedEmailDomain = (
  process.env.ALLOWED_BLOGGER_EMAIL_DOMAIN || "kairosummit.org"
).toLowerCase();
const avatarBucket = process.env.BLOGGER_AVATAR_BUCKET || "blogger-avatars";
const resetPasswordRedirectTo = process.env.BLOGGER_RESET_PASSWORD_REDIRECT_URL;

const isAllowedBloggerEmail = (email: string): boolean => {
  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail.endsWith(`@${allowedEmailDomain}`);
};

const uploadAvatarIfPresent = async (file?: Express.Multer.File): Promise<string | null> => {
  if (!file) {
    return null;
  }

  if (!supabaseAdmin) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to upload profile photos from backend"
    );
  }

  const safeExtension = file.mimetype.split("/")[1] || "jpg";
  const filePath = `blogger/${Date.now()}-${randomUUID()}.${safeExtension}`;

  const { error } = await supabaseAdmin.storage
    .from(avatarBucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload avatar: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(avatarBucket).getPublicUrl(filePath);
  return data.publicUrl;
};

authRouter.post(
  "/signup",
  upload.single("photo"),
  async (req: Request, res: Response): Promise<void> => {
    const { fullName, email, password, confirmPassword } = req.body as Record<
      string,
      string | undefined
    >;

    if (!fullName || !email || !password || !confirmPassword) {
      res.status(400).json({ message: "fullName, email, password, and confirmPassword are required" });
      return;
    }

    if (!isAllowedBloggerEmail(email)) {
      res
        .status(400)
        .json({ message: `Only @${allowedEmailDomain} email addresses are allowed` });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ message: "Password and confirmPassword do not match" });
      return;
    }

    try {
      const avatarUrl = await uploadAvatarIfPresent(req.file);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            avatar_url: avatarUrl
          }
        }
      });

      if (error) {
        res.status(400).json({ message: error.message });
        return;
      }

      if (supabaseAdmin && data.user) {
        const { error: profileError } = await supabaseAdmin.from("bloggers").upsert(
          {
            user_id: data.user.id,
            full_name: fullName.trim(),
            avatar_url: avatarUrl
          },
          { onConflict: "user_id" }
        );

        if (profileError) {
          res.status(400).json({ message: profileError.message });
          return;
        }
      }

      res.status(201).json({
        message: "Signup successful",
        user: data.user,
        session: data.session
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected signup error occurred";
      res.status(500).json({ message });
    }
  }
);

authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as Record<string, string | undefined>;

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  if (!isAllowedBloggerEmail(email)) {
    res
      .status(400)
      .json({ message: `Only @${allowedEmailDomain} email addresses are allowed` });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) {
    res.status(401).json({ message: error.message });
    return;
  }

  res.status(200).json({
    message: "Login successful",
    user: data.user,
    session: data.session
  });
});

authRouter.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as Record<string, string | undefined>;

  if (!email) {
    res.status(400).json({ message: "email is required" });
    return;
  }

  if (!isAllowedBloggerEmail(email)) {
    res
      .status(400)
      .json({ message: `Only @${allowedEmailDomain} email addresses are allowed` });
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: resetPasswordRedirectTo
  });

  if (error) {
    res.status(400).json({ message: error.message });
    return;
  }

  res.status(200).json({ message: "Password reset email sent" });
});

authRouter.get("/me", auth, (req: Request, res: Response) => {
  res.status(200).json({
    userId: req.userId,
    user: req.user
  });
});

export { authRouter };
