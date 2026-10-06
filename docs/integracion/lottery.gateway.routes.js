// COPIAR A: intranet-api-auth/src/routes/lottery.gateway.routes.js
// y registrarlo en intranet-api-auth/src/index.js:
//   import lotteryRoutes from "./routes/lottery.gateway.routes.js";
//   app.use(lotteryRoutes);
//
// Mismo patrón que gss-credit.gateway.routes.js: valida la cookie, comprueba el permiso de la ruta
// exacta en Routes_backend / Routes_backend_child y reenvía al servicio con x-auth-token.
import { Router } from "express";
import proxy from "express-http-proxy";
import gateWayController from "../controllers/gateway.controller.js";
import { checkAuth } from "../middlewares/checkAuth.js";

const router = Router();

// Puerto del servicio de sorteos en la red Docker. CONFIRMAR con el equipo de la intranet que esté libre.
const LOTTERY_SERVICE_PORT = 3060;

router.use("/apiv1/lottery-service", checkAuth, async (req, res, next) => {
  // Ruta padre registrada en Routes_backend (ver seed-rutas-sorteos.js)
  const route = "/lottery-service";

  const response = await gateWayController.gateWayController(req, res, route);

  // Sin acceso: gateWayController ya respondió 401/403
  if (response && response.token === undefined) {
    console.log("SIN ACCESO A LA RUTA:", route + req.path);
    return;
  }

  proxy(`http://${process.env.DOCKER_SERVER_IP}:${LOTTERY_SERVICE_PORT}/`, {
    proxyReqOptDecorator: (proxyReqOpts) => {
      proxyReqOpts.headers["x-auth-token"] = response.token;
      return proxyReqOpts;
    },
  })(req, res, next);
});

export default router;
