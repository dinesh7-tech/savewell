import { Router, type IRouter } from "express";
import healthRouter from "./health";
import savewellRouter from "./savewell";

const router: IRouter = Router();

router.use(healthRouter);
router.use(savewellRouter);

export { healthRouter, savewellRouter };
export default router;

