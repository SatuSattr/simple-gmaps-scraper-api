import { app, closeBrowser } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(
    `simple gmaps scraper api is live! Listening on port ${port}. Try /search?q=coffee&limit=3`,
  );
});

process.on("SIGINT", closeBrowser);
process.on("SIGTERM", closeBrowser);
