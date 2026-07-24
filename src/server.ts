import { app } from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`Page Pulse API running on port ${PORT}`);
});