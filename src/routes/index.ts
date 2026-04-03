import { Router } from "express";

import { blogRouter } from "./blog.routes";

const apiRouter = Router();

apiRouter.use("/blogs", blogRouter);

export { apiRouter };
