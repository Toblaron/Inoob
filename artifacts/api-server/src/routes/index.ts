import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sunoRouter from "./suno";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sunoRouter);

export default router;
