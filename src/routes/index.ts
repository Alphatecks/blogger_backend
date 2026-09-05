import { Router } from "express";

import { authRouter } from "./auth.routes";
import { blogRouter } from "./blog.routes";
import { registrationRouter } from "./registration.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/blogs", blogRouter);
apiRouter.use("/registrations", registrationRouter);

export { apiRouter };
