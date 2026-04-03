import { Router } from "express";

const blogRouter = Router();

blogRouter.get("/", (_req, res) => {
  res.status(200).json({
    message: "Kairos Summit blog API",
    data: []
  });
});

export { blogRouter };
