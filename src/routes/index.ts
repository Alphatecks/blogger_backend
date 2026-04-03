import { Router } from "express";

import { authRouter } from "./auth.routes";
import { blogRouter } from "./blog.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/blogs", blogRouter);

export { apiRouter };
