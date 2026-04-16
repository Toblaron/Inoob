import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sunoRouter from "./suno";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sunoRouter);
router.use(historyRouter);

export default router;
