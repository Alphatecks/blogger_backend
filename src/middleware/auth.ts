import type { NextFunction, Request, Response } from "express";

import { supabase } from "../config/supabase";

export const auth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  req.userId = data.user.id;
  req.user = data.user;
  next();
};
