import { Router } from "express";

import { authRouter } from "./auth.routes";
import { blogRouter } from "./blog.routes";
import { registrationRouter } from "./registration.routes";
import { shopRouter } from "./shop.routes";
import { volunteerRouter } from "./volunteer.routes";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/blogs", blogRouter);
apiRouter.use("/registrations", registrationRouter);
apiRouter.use("/shop", shopRouter);
apiRouter.use("/volunteers", volunteerRouter);

export { apiRouter };
